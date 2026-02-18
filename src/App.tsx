import React, { useState } from 'react';
import './App.css';
import { UserBiometrics, AnalysisResult, AnalysisStatus } from './types';
import { analyzeRisk } from './utils/api';

const FAMILY_CONDITIONS = [
  'Breast Cancer', 'Colon Cancer', 'Prostate Cancer', 'Lung Cancer',
  'Ovarian Cancer', 'Pancreatic Cancer', 'Melanoma', 'Leukemia',
];

const STATUS_MESSAGES: Record<AnalysisStatus, string> = {
  idle: '',
  searching: '🔍 Building search queries from your profile...',
  fetching_abstracts: '📚 Fetching peer-reviewed abstracts from PubMed...',
  analyzing: '🧬 Amazon Bedrock is analyzing correlations...',
  complete: '',
  error: '',
};

const DEFAULT_FORM: UserBiometrics = {
  age: 40,
  bmi: 24,
  sex: 'male',
  smokingStatus: 'never',
  alcoholConsumption: 'none',
  dietaryPattern: 'mediterranean',
  familyHistory: [],
};

export default function App() {
  const [form, setForm] = useState<UserBiometrics>(DEFAULT_FORM);
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);

    // Simulate progressive status updates for better UX
    setStatus('searching');
    await delay(1000);
    setStatus('fetching_abstracts');
    await delay(1000);
    setStatus('analyzing');

    try {
      const data = await analyzeRisk(form);
      setResult(data);
      setStatus('complete');
    } catch (err: any) {
      setError(err.message || 'Analysis failed. Please try again.');
      setStatus('error');
    }
  };

  const toggleFamilyHistory = (condition: string) => {
    setForm(f => ({
      ...f,
      familyHistory: f.familyHistory.includes(condition)
        ? f.familyHistory.filter(c => c !== condition)
        : [...f.familyHistory, condition],
    }));
  };

  const isLoading = ['searching', 'fetching_abstracts', 'analyzing'].includes(status);

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <span className="logo-icon">🧬</span>
          <div>
            <h1>OncoGenie</h1>
            <p className="tagline">AI-Powered Cancer Risk Correlation Analysis</p>
          </div>
        </div>
        <div className="powered-by">Powered by Amazon Bedrock & PubMed</div>
      </header>

      <main className="main">
        <div className="disclaimer-banner">
          ⚕️ <strong>Medical Disclaimer:</strong> This tool provides educational correlations only.
          It does <em>not</em> constitute medical advice or diagnosis. Always consult a licensed physician.
        </div>

        <div className="content-grid">
          {/* ── Input Form ── */}
          <section className="form-section">
            <h2>Your Health Profile</h2>
            <form onSubmit={handleSubmit}>
              {/* Biometrics */}
              <fieldset>
                <legend>Biometrics</legend>
                <div className="field-row">
                  <div className="field">
                    <label>Age</label>
                    <input type="number" min={18} max={100}
                      value={form.age}
                      onChange={e => setForm(f => ({ ...f, age: +e.target.value }))} />
                  </div>
                  <div className="field">
                    <label>BMI</label>
                    <input type="number" min={10} max={60} step="0.1"
                      value={form.bmi}
                      onChange={e => setForm(f => ({ ...f, bmi: +e.target.value }))} />
                  </div>
                  <div className="field">
                    <label>Biological Sex</label>
                    <select value={form.sex}
                      onChange={e => setForm(f => ({ ...f, sex: e.target.value as any }))}>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other / Prefer not to say</option>
                    </select>
                  </div>
                </div>
              </fieldset>

              {/* Habits */}
              <fieldset>
                <legend>Habits & Diet</legend>
                <div className="field-row">
                  <div className="field">
                    <label>Smoking Status</label>
                    <select value={form.smokingStatus}
                      onChange={e => setForm(f => ({ ...f, smokingStatus: e.target.value as any }))}>
                      <option value="never">Never Smoked</option>
                      <option value="former">Former Smoker</option>
                      <option value="current">Current Smoker</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Alcohol Consumption</label>
                    <select value={form.alcoholConsumption}
                      onChange={e => setForm(f => ({ ...f, alcoholConsumption: e.target.value as any }))}>
                      <option value="none">None</option>
                      <option value="light">Light (1–2 drinks/week)</option>
                      <option value="moderate">Moderate (3–7 drinks/week)</option>
                      <option value="heavy">Heavy (8+ drinks/week)</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Dietary Pattern</label>
                    <select value={form.dietaryPattern}
                      onChange={e => setForm(f => ({ ...f, dietaryPattern: e.target.value as any }))}>
                      <option value="mediterranean">Mediterranean</option>
                      <option value="western">Western / Processed</option>
                      <option value="vegetarian">Vegetarian</option>
                      <option value="vegan">Vegan</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
              </fieldset>

              {/* Family History */}
              <fieldset>
                <legend>Family History</legend>
                <p className="field-hint">Select any known hereditary conditions in your family:</p>
                <div className="checkbox-grid">
                  {FAMILY_CONDITIONS.map(cond => (
                    <label key={cond} className={`checkbox-label ${form.familyHistory.includes(cond) ? 'checked' : ''}`}>
                      <input type="checkbox"
                        checked={form.familyHistory.includes(cond)}
                        onChange={() => toggleFamilyHistory(cond)} />
                      {cond}
                    </label>
                  ))}
                </div>
              </fieldset>

              <button type="submit" className="submit-btn" disabled={isLoading}>
                {isLoading ? '⏳ Analyzing...' : '🔬 Analyze Risk Profile'}
              </button>
            </form>
          </section>

          {/* ── Results Panel ── */}
          <section className="results-section">
            {isLoading && (
              <div className="loading-card">
                <div className="spinner" />
                <p className="loading-status">{STATUS_MESSAGES[status]}</p>
                <div className="pipeline-steps">
                  <PipelineStep label="Build Queries" done={status !== 'searching'} active={status === 'searching'} />
                  <PipelineStep label="Fetch Abstracts" done={status === 'analyzing'} active={status === 'fetching_abstracts'} />
                  <PipelineStep label="Bedrock Analysis" done={status === 'complete'} active={status === 'analyzing'} />
                </div>
              </div>
            )}

            {status === 'error' && (
              <div className="error-card">
                <h3>⚠️ Analysis Error</h3>
                <p>{error}</p>
                <button onClick={() => setStatus('idle')}>Try Again</button>
              </div>
            )}

            {result && (
              <div className="results-card">
                <h2>Risk Correlation Analysis</h2>
                <p className="result-timestamp">
                  Analysis completed · {new Date().toLocaleString()}
                </p>

                {result.insights.map((insight, i) => (
                  <div key={i} className={`insight-card risk-${insight.riskLevel}`}>
                    <div className="insight-header">
                      <h3>{insight.cancerType}</h3>
                      <span className={`risk-badge ${insight.riskLevel}`}>
                        {insight.riskLevel.toUpperCase()} ASSOCIATION
                      </span>
                    </div>
                    <p className="insight-explanation">{insight.explanation}</p>
                    <div className="citations">
                      <strong>📖 Sources:</strong>
                      {insight.citations.map((c, j) => (
                        <a key={j} href={c.url} target="_blank" rel="noopener noreferrer" className="citation-link">
                          [{j + 1}] {c.title}
                        </a>
                      ))}
                    </div>
                    <div className="recommendation">
                      <strong>💡 Recommendation:</strong> {insight.recommendation}
                    </div>
                  </div>
                ))}

                <div className="disclaimer-footer">{result.disclaimer}</div>

                {/* Abstracts Section */}
                <details className="abstracts-details">
                  <summary>📚 View Source Abstracts ({result.searchedAbstracts?.length || 0})</summary>
                  {result.searchedAbstracts?.map((ab, i) => (
                    <div key={i} className="abstract-card">
                      <h4><a href={ab.url} target="_blank" rel="noopener noreferrer">{ab.title}</a></h4>
                      <p>{ab.abstract.slice(0, 400)}...</p>
                    </div>
                  ))}
                </details>
              </div>
            )}

            {status === 'idle' && (
              <div className="idle-placeholder">
                <span className="idle-icon">🔬</span>
                <p>Fill out your health profile and click <strong>Analyze Risk Profile</strong> to receive AI-powered insights grounded in peer-reviewed research.</p>
              </div>
            )}
          </section>
        </div>
      </main>

      <footer className="footer">
        <p>OncoGenie · Built with AWS Amplify & Amazon Bedrock · Data from PubMed Central (Open Access)</p>
        <p>⚕️ Not a medical device. For educational purposes only.</p>
      </footer>
    </div>
  );
}

function PipelineStep({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <div className={`pipeline-step ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
      <span className="step-icon">{done ? '✅' : active ? '⏳' : '⭕'}</span>
      <span>{label}</span>
    </div>
  );
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
