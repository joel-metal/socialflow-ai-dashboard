// Stub for missing geminiService module
class GeminiServiceError extends Error {}
module.exports = {
  GeminiServiceError,
  analyzeImage: jest.fn(() => Promise.resolve({ description: 'stub' })),
};
