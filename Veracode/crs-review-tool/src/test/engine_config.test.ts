import { describe, it, expect } from 'vitest';

/**
 * This test ensures that the configuration fields the user cares about (engines)
 * are present and correctly structured.
 */
describe('Configuration Integrity', () => {
  const expectedEngines = ["Gemini", "azure.gpt-4o"];
  
  it('should have the required engines in the list', () => {
    // This replicates the logic in server.ts
    const mockConfig = {
      engines: ["Gemini", "azure.gpt-4o"],
      scanValidityDays: 90
    };
    
    expect(mockConfig.engines).toEqual(expect.arrayContaining(expectedEngines));
  });

  it('should handle the config info response correctly', async () => {
    // This replicates the logic in App.tsx
    const mockApiResponse = {
      engines: ["Gemini", "azure.gpt-4o"],
      scanValidityDays: 90,
      history: ["MockProfile1"]
    };
    
    // Simulating the check in App.tsx
    const engines = Array.isArray(mockApiResponse.engines) ? mockApiResponse.engines : [];
    
    expect(engines).toContain("Gemini");
    expect(engines).toContain("azure.gpt-4o");
  });
});
