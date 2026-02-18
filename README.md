# 🧬 OncoGenie — AI Cancer Risk Correlation Platform

> **Medical Disclaimer:** OncoGenie provides educational correlations only. It does **not** constitute medical advice or diagnosis. Always consult a licensed physician.

---

## Architecture Overview

```
User Browser
    │
    ▼
AWS Amplify (React SPA)
    │  HTTPS POST /analyze
    ▼
API Gateway (REST)
    │
    ▼
AWS Lambda (Python 3.12) ──► PubMed Central API (Free, Open Access)
    │                              (Fetches 3–5 peer-reviewed abstracts)
    │
    ▼
Amazon Bedrock
(Claude 3.5 Sonnet)
    │
    ▼
JSON Risk Report → Frontend
```

---

## Tech Stack

| Layer       | Technology                                      |
|-------------|--------------------------------------------------|
| Hosting     | AWS Amplify (Gen 2)                              |
| Frontend    | React 18 + TypeScript                            |
| Backend     | AWS Lambda (Python 3.12) via API Gateway         |
| AI Engine   | Amazon Bedrock — Claude 3.5 Sonnet               |
| Data Source | PubMed Central E-Utilities API (Free, OA only)   |
| IAM         | Least-privilege role, `bedrock:InvokeModel` only |

---

## Model Selection: Why Claude 3.5 Sonnet on Bedrock?

- **Clinical Accuracy:** Claude 3.5 Sonnet excels at following strict system prompts, making it ideal for enforcing medical objectivity constraints (no diagnosis, citation-only claims).
- **JSON Reliability:** Consistent structured output means fewer parsing failures in the pipeline.
- **Context Window:** Handles 3–5 full abstracts + user profile within a single inference call.
- **Fallback:** `amazon.titan-text-express-v1` is listed in the IAM policy as a cheap alternative for testing.

---

## RAG Pipeline

1. **Query Builder** (`build_search_queries`): Translates biometric + lifestyle inputs into PubMed-optimized search strings. For example, BMI ≥ 30 + western diet generates `"obesity BMI cancer risk endometrial breast colorectal"`.

2. **PubMed E-Utilities** (`search_pubmed` + `fetch_abstracts`): Calls `esearch.fcgi` to get PMIDs, then `efetch.fcgi` with `retmode=xml` to retrieve full abstract XML. Filters to `free full text[sb]` to ensure open-access compliance. Regex-parses XML without external dependencies.

3. **Bedrock Inference** (`invoke_bedrock`): Passes the structured user profile and all abstracts into a single Claude call with a strict system prompt. The prompt enforces:
   - No definitive diagnosis
   - Citation of source URLs in every insight
   - JSON-only output format

4. **Attribution**: Every insight card in the UI displays clickable PubMed links.

---

## Data Latency Management

**Problem:** PubMed scraping (~5–15s) + Bedrock inference (~10–30s) = 15–45s total, exceeding typical API timeouts.

**Solutions implemented:**
- Lambda timeout set to **90 seconds** in CloudFormation.
- API Gateway integration timeout extended to **29 seconds** (AWS max) — if needed, upgrade to async via SQS + polling.
- **Progressive UI states** on the frontend: `searching → fetching_abstracts → analyzing` with visual pipeline indicator, so users see activity instead of a blank screen.
- React `useState` manages the async lifecycle locally — no additional infra needed for the prototype.

**Production upgrade path:** Replace synchronous Lambda with SNS/SQS → Lambda → DynamoDB → AppSync subscription (real-time push to client), eliminating all timeout concerns.

---

## IAM & Security (Principle of Least Privilege)

```yaml
# Only InvokeModel permission — no wildcard actions, no wildcard resources
- Effect: Allow
  Action:
    - bedrock:InvokeModel
  Resource:
    - arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-20240620-v1:0
    - arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-text-express-v1
```

No S3, no DynamoDB, no VPC — only the exact Bedrock model ARNs needed.

---

## Prompt Engineering

The system prompt enforces 5 hard constraints:
1. Never provide a definitive diagnosis
2. Always frame as "research suggests a potential correlation"
3. Every insight must cite a source URL
4. Recommend physician consultation
5. Return strict JSON only

---

## Deployment Guide

### Prerequisites
- AWS account with Bedrock model access enabled (Claude 3.5 Sonnet in `us-east-1`)
- GitHub account
- AWS Amplify console access

### Step 1: Fork & Push to GitHub
```bash
git clone https://github.com/YOUR_USERNAME/oncogenie
cd oncogenie
git remote set-url origin https://github.com/YOUR_USERNAME/oncogenie
git push -u origin main
```

### Step 2: Deploy Lambda Backend
```bash
cd amplify/backend/function/oncogenieApi
pip install aws-sam-cli
sam build
sam deploy --guided
# Note the ApiEndpoint output URL
```

### Step 3: Set Environment Variable
Copy `.env.example` to `.env.local` and set:
```
REACT_APP_API_ENDPOINT=https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/prod
```

### Step 4: Deploy Frontend via AWS Amplify Console
1. Go to [AWS Amplify Console](https://console.aws.amazon.com/amplify/)
2. Click **"New App → Host web app"**
3. Connect your GitHub repo
4. In **Environment Variables**, add:
   - `REACT_APP_API_ENDPOINT` = your API Gateway URL
   - `REACT_APP_AWS_REGION` = `us-east-1`
5. Build settings: Amplify auto-detects `amplify.yml` ✓
6. Click **Save and Deploy**

Your app will be live at `https://BRANCH.APP_ID.amplifyapp.com`

---

## Error Handling

| Failure Point      | Handling                                                      |
|--------------------|---------------------------------------------------------------|
| PubMed unreachable | Returns 502 with descriptive error message                    |
| No abstracts found | Returns 502 — prevents hallucinated citations                 |
| Bedrock timeout    | Lambda 90s timeout with CloudWatch logs                       |
| Bedrock JSON error | Regex strips markdown fences, falls back with parse error log |
| Frontend API error | Error card with "Try Again" button                            |

---

## Cost Estimate (Free Tier)

- **PubMed API**: Free, no key required for ≤3 req/sec
- **Lambda**: 1M free requests/month
- **API Gateway**: 1M free calls/month
- **Bedrock**: ~$0.003 per 1K input tokens + ~$0.015 per 1K output tokens (Claude 3.5 Sonnet)
  - Estimated cost per analysis: ~$0.02–0.05
- **Amplify Hosting**: Free tier for builds + 5GB storage

---

## Project Structure

```
oncogenie/
├── amplify.yml                          # Amplify build config
├── amplify/
│   └── backend/
│       └── function/
│           └── oncogenieApi/
│               ├── template.yaml        # SAM/CloudFormation (Lambda + IAM + APIGW)
│               └── src/
│                   └── index.py         # RAG pipeline (PubMed + Bedrock)
├── public/
│   └── index.html
├── src/
│   ├── App.tsx                          # Main UI with form + results
│   ├── App.css                          # Professional medical UI styles
│   ├── aws-config.ts                    # Amplify configuration
│   ├── index.tsx                        # React entry point
│   ├── types/index.ts                   # TypeScript interfaces
│   └── utils/api.ts                     # API Gateway client
├── .env.example
├── .gitignore
├── package.json
└── tsconfig.json
```
