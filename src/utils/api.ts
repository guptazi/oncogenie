import { UserBiometrics, AnalysisResult } from '../types';

const API_ENDPOINT = process.env.REACT_APP_API_ENDPOINT || '';

export async function analyzeRisk(userData: UserBiometrics): Promise<AnalysisResult> {
  const response = await fetch(`${API_ENDPOINT}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userData }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `HTTP ${response.status}`);
  }
  return response.json();
}
