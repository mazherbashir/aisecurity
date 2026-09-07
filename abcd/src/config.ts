export interface AppConfig {
  API_BASE_URL: string;
  ENDPOINTS: {
    configInfo: string;
    configPrompts: string;
    getFinalReport: string;
    veracodeMitigation: string;
    checkmarxMitigation: string;
    aiAnalyze: string;
    heartbeat: string;
    mitigationPresets: string;
  };
}

let config: AppConfig = {
  API_BASE_URL: '',
  ENDPOINTS: {
    configInfo: '/api/config/info',
    configPrompts: '/api/config/prompts',
    getFinalReport: '/api/getfinalreport',
    veracodeMitigation: '/api/veracode/mitigation',
    checkmarxMitigation: '/api/checkmarx/mitigation',
    aiAnalyze: '/api/ai/analyze',
    heartbeat: '/api/heartbeat',
    mitigationPresets: '/api/mitigation-presets'
  }
};

export const loadConfig = async () => {
  try {
    const response = await fetch('./env-config.json');
    if (response.ok) {
      const data = await response.json();
      config = { ...config, ...data, ENDPOINTS: { ...config.ENDPOINTS, ...(data.ENDPOINTS || {}) } };
    }
  } catch (error) {
    console.warn('Failed to load env-config.json, using defaults', error);
  }
};

export const getApiBaseUrl = () => config.API_BASE_URL;
export const getEndpoint = (key: keyof AppConfig['ENDPOINTS']) => {
  return `${config.API_BASE_URL}${config.ENDPOINTS[key]}`;
};
