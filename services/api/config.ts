// Stub — config now lives in backend. Kept for import compatibility.
export interface ApiConfig {
  iiko: { apiKey: string; apiUrl?: string; organizationId: string; enabled: boolean };
}

class ApiConfigManager {
  loadConfig(): ApiConfig {
    return { iiko: { apiKey: '', apiUrl: '', organizationId: '', enabled: false } };
  }
  getConfig(): ApiConfig { return this.loadConfig(); }
  updateIikoConfig(_config: Partial<ApiConfig['iiko']>): void {}
  isIikoEnabled(): boolean { return false; }
}

export const apiConfigManager = new ApiConfigManager();
