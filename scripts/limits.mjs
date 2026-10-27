export const limits = Object.freeze({
  uploadBytes: 10 * 1024 * 1024,
  documentChunks: 160,
  monthlyQuestions: 1000,
  questionsPerMinute: 5,
  businessQuestionsPerMinute: 30,
  questionCharacters: 1000,
});

export const fallbackAnswer = 'I could not find an answer in the uploaded documents. Please contact the business directly.';

export function validateQuestion(value) {
  if (typeof value !== 'string' || !value.trim()) throw Object.assign(new Error('Enter a question first.'), { status: 400 });
  if (value.trim().length > limits.questionCharacters) throw Object.assign(new Error('Keep your question to 1,000 characters.'), { status: 400 });
  return value.trim();
}
