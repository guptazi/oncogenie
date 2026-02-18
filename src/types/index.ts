export interface UserBiometrics {
  age: number;
  bmi: number;
  sex: "male" | "female" | "other";
  smokingStatus: "never" | "former" | "current";
  alcoholConsumption: "none" | "light" | "moderate" | "heavy";
  dietaryPattern: "mediterranean" | "western" | "vegetarian" | "vegan" | "other";
  familyHistory: string[];
}

export interface Abstract {
  title: string;
  abstract: string;
  doi?: string;
  url: string;
  year?: number;
}

export interface RiskInsight {
  riskLevel: "low" | "moderate" | "high";
  cancerType: string;
  explanation: string;
  citations: Array<{ title: string; url: string }>;
  recommendation: string;
}

export interface AnalysisResult {
  insights: RiskInsight[];
  disclaimer: string;
  searchedAbstracts: Abstract[];
  timestamp: string;
}

export type AnalysisStatus = "idle" | "searching" | "fetching_abstracts" | "analyzing" | "complete" | "error";
