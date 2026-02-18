"""
OncoGenie Lambda Handler
RAG Pipeline: PubMed Central → Amazon Bedrock
"""

import json
import os
import urllib.request
import urllib.parse
import re
import boto3
from botocore.exceptions import ClientError

# ── AWS Clients ──────────────────────────────────────────────────────────────
bedrock = boto3.client("bedrock-runtime", region_name=os.environ.get("AWS_REGION", "us-east-1"))

# ── Constants ─────────────────────────────────────────────────────────────────
PUBMED_SEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
PUBMED_FETCH_URL  = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
PUBMED_SUMMARY_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "anthropic.claude-3-5-sonnet-20240620-v1:0")


SYSTEM_PROMPT = """You are OncoGenie, a clinical informatics assistant. Your role is to analyze 
user health data alongside peer-reviewed research abstracts and identify potential cancer risk 
correlations.

STRICT RULES:
1. You MUST NOT provide a definitive medical diagnosis under any circumstances.
2. Always frame insights as "research suggests a potential correlation" or "evidence indicates 
   an elevated association" — never as certainties.
3. Every insight MUST cite at least one source abstract by its DOI or URL.
4. Recommend consulting a licensed oncologist or primary care physician for all concerns.
5. Maintain clinical objectivity — do not minimize or exaggerate risk factors.
6. Structure your response as valid JSON only, no markdown or prose outside the JSON.

OUTPUT FORMAT (strict JSON):
{
  "insights": [
    {
      "cancerType": "string",
      "riskLevel": "low|moderate|high",
      "explanation": "string — evidence-based, non-diagnostic explanation",
      "citations": [{"title": "string", "url": "string"}],
      "recommendation": "string — actionable, physician-referral-oriented"
    }
  ],
  "disclaimer": "string — standard medical disclaimer"
}"""


# ── Helper: build PubMed search query from user data ─────────────────────────
def build_search_queries(user_data: dict) -> list[str]:
    queries = []
    base_factors = []

    if user_data.get("smokingStatus") == "current":
        queries.append("smoking lung cancer risk factors epidemiology")
        base_factors.append("smoking")
    if user_data.get("smokingStatus") == "former":
        queries.append("former smoker cancer risk reduction")

    alcohol = user_data.get("alcoholConsumption", "none")
    if alcohol in ("moderate", "heavy"):
        queries.append("alcohol consumption cancer risk liver colorectal")

    bmi = float(user_data.get("bmi", 22))
    if bmi >= 30:
        queries.append("obesity BMI cancer risk endometrial breast colorectal")
    elif bmi >= 25:
        queries.append("overweight cancer risk metabolic syndrome")

    diet = user_data.get("dietaryPattern", "")
    if diet == "western":
        queries.append("western diet processed food cancer risk")
    elif diet in ("mediterranean", "vegetarian", "vegan"):
        queries.append("plant based diet cancer prevention")

    family_history = user_data.get("familyHistory", [])
    for condition in family_history:
        if condition:
            queries.append(f"hereditary {condition} cancer genetic risk")

    age = int(user_data.get("age", 40))
    sex  = user_data.get("sex", "other")
    if age >= 50 and sex == "male":
        queries.append("prostate cancer age risk screening men")
    if age >= 40 and sex == "female":
        queries.append("breast cancer age risk screening women mammography")
    if age >= 45:
        queries.append("colorectal cancer age risk colonoscopy screening")

    # Fallback generic query
    if not queries:
        queries.append("lifestyle cancer risk prevention epidemiology")

    return queries[:3]  # Limit to 3 queries → 3–5 abstracts total


# ── Helper: fetch PMIDs from PubMed ──────────────────────────────────────────
def search_pubmed(query: str, max_results: int = 2) -> list[str]:
    params = urllib.parse.urlencode({
        "db": "pubmed",
        "term": query,
        "retmax": max_results,
        "retmode": "json",
        "sort": "relevance",
        "filter": "free full text[sb]",  # Open access only
    })
    url = f"{PUBMED_SEARCH_URL}?{params}"
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            data = json.loads(resp.read())
            return data.get("esearchresult", {}).get("idlist", [])
    except Exception as e:
        print(f"[PubMed Search Error] {e}")
        return []


# ── Helper: fetch abstract text for a list of PMIDs ──────────────────────────
def fetch_abstracts(pmids: list[str]) -> list[dict]:
    if not pmids:
        return []

    params = urllib.parse.urlencode({
        "db": "pubmed",
        "id": ",".join(pmids),
        "retmode": "xml",
        "rettype": "abstract",
    })
    url = f"{PUBMED_FETCH_URL}?{params}"
    abstracts = []

    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            xml_content = resp.read().decode("utf-8")

        # Parse XML with regex (no external deps)
        articles = re.findall(r"<PubmedArticle>(.*?)</PubmedArticle>", xml_content, re.DOTALL)

        for article in articles:
            title_match    = re.search(r"<ArticleTitle>(.*?)</ArticleTitle>", article, re.DOTALL)
            abstract_match = re.search(r"<AbstractText.*?>(.*?)</AbstractText>", article, re.DOTALL)
            pmid_match     = re.search(r"<PMID Version=\"1\">(.*?)</PMID>", article)
            year_match     = re.search(r"<PubDate>.*?<Year>(.*?)</Year>", article, re.DOTALL)

            if title_match and abstract_match:
                pmid = pmid_match.group(1).strip() if pmid_match else "unknown"
                abstracts.append({
                    "title":    re.sub(r"<[^>]+>", "", title_match.group(1)).strip(),
                    "abstract": re.sub(r"<[^>]+>", "", abstract_match.group(1)).strip(),
                    "url":      f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
                    "doi":      f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
                    "year":     year_match.group(1).strip() if year_match else None,
                })
    except Exception as e:
        print(f"[PubMed Fetch Error] {e}")

    return abstracts


# ── Helper: invoke Amazon Bedrock ─────────────────────────────────────────────
def invoke_bedrock(user_data: dict, abstracts: list[dict]) -> dict:
    abstract_context = "\n\n".join([
        f"SOURCE [{i+1}]: {a['title']}\nURL: {a['url']}\n\nABSTRACT: {a['abstract']}"
        for i, a in enumerate(abstracts)
    ])

    user_message = f"""PATIENT PROFILE:
- Age: {user_data.get('age')}
- Sex: {user_data.get('sex')}
- BMI: {user_data.get('bmi')}
- Smoking Status: {user_data.get('smokingStatus')}
- Alcohol Consumption: {user_data.get('alcoholConsumption')}
- Dietary Pattern: {user_data.get('dietaryPattern')}
- Family History of Conditions: {', '.join(user_data.get('familyHistory', [])) or 'None reported'}

RESEARCH ABSTRACTS:
{abstract_context}

Based on the patient profile and the provided research abstracts, generate a comprehensive 
cancer risk correlation analysis. Cite only the sources provided above."""

    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 2048,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": user_message}],
    })

    try:
        response = bedrock.invoke_model(modelId=MODEL_ID, body=body)
        result   = json.loads(response["body"].read())
        raw_text = result["content"][0]["text"]

        # Strip any markdown fences
        raw_text = re.sub(r"```json|```", "", raw_text).strip()
        return json.loads(raw_text)
    except ClientError as e:
        print(f"[Bedrock Error] {e}")
        raise
    except json.JSONDecodeError as e:
        print(f"[JSON Parse Error] {e} | Raw: {raw_text[:500]}")
        raise


# ── Lambda Entrypoint ─────────────────────────────────────────────────────────
def handler(event, context):
    # CORS headers
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Content-Type": "application/json",
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": headers, "body": ""}

    try:
        body      = json.loads(event.get("body", "{}"))
        user_data = body.get("userData", {})

        if not user_data:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"error": "userData is required"}),
            }

        # ── Step 1: Build search queries ──────────────────────────────────────
        queries = build_search_queries(user_data)
        print(f"[Queries] {queries}")

        # ── Step 2: Fetch PMIDs ───────────────────────────────────────────────
        all_pmids = []
        for q in queries:
            pmids = search_pubmed(q, max_results=2)
            all_pmids.extend(pmids)

        # Deduplicate, cap at 5
        all_pmids = list(dict.fromkeys(all_pmids))[:5]
        print(f"[PMIDs] {all_pmids}")

        # ── Step 3: Fetch abstracts ───────────────────────────────────────────
        abstracts = fetch_abstracts(all_pmids)
        print(f"[Abstracts fetched] {len(abstracts)}")

        if not abstracts:
            return {
                "statusCode": 502,
                "headers": headers,
                "body": json.dumps({"error": "No abstracts could be retrieved from PubMed"}),
            }

        # ── Step 4: Bedrock inference ─────────────────────────────────────────
        llm_result = invoke_bedrock(user_data, abstracts)

        # Attach the raw abstracts for frontend display
        llm_result["searchedAbstracts"] = abstracts
        llm_result["timestamp"]         = context.aws_request_id

        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps(llm_result),
        }

    except Exception as e:
        print(f"[Unhandled Error] {e}")
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": str(e)}),
        }
