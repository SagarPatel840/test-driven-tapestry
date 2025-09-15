/**
 * Security utilities for input validation and sanitization
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates email format
 */
export const validateEmail = (email: string): ValidationResult => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!email) {
    return { isValid: false, error: 'Email is required' };
  }
  
  if (email.length > 100) {
    return { isValid: false, error: 'Email must be less than 100 characters' };
  }
  
  if (!emailRegex.test(email)) {
    return { isValid: false, error: 'Please enter a valid email address' };
  }
  
  return { isValid: true };
};

/**
 * Validates URL format
 */
export const validateUrl = (url: string): ValidationResult => {
  if (!url) {
    return { isValid: false, error: 'URL is required' };
  }
  
  if (url.length > 500) {
    return { isValid: false, error: 'URL must be less than 500 characters' };
  }
  
  try {
    const urlObj = new URL(url);
    if (!urlObj.protocol.startsWith('http')) {
      return { isValid: false, error: 'URL must use HTTP or HTTPS protocol' };
    }
    return { isValid: true };
  } catch {
    return { isValid: false, error: 'Please enter a valid URL' };
  }
};

/**
 * Validates OpenAI API key format
 */
export const validateOpenAIApiKey = (apiKey: string): ValidationResult => {
  if (!apiKey) {
    return { isValid: false, error: 'API key is required' };
  }
  
  if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
    return { isValid: false, error: 'Please enter a valid OpenAI API key (starts with "sk-")' };
  }
  
  return { isValid: true };
};

/**
 * Validates text input with length constraints
 */
export const validateText = (
  text: string, 
  fieldName: string, 
  minLength: number = 1, 
  maxLength: number = 255,
  required: boolean = true
): ValidationResult => {
  if (!text && required) {
    return { isValid: false, error: `${fieldName} is required` };
  }
  
  if (!text && !required) {
    return { isValid: true };
  }
  
  if (text.length < minLength) {
    return { isValid: false, error: `${fieldName} must be at least ${minLength} characters` };
  }
  
  if (text.length > maxLength) {
    return { isValid: false, error: `${fieldName} must be less than ${maxLength} characters` };
  }
  
  return { isValid: true };
};

/**
 * Sanitizes text input by trimming whitespace and removing potentially dangerous characters
 */
export const sanitizeText = (text: string): string => {
  if (!text) return '';
  
  return text
    .trim()
    .replace(/[<>]/g, '') // Remove HTML brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, ''); // Remove event handlers
};

/**
 * Sanitizes HTML by removing script tags and dangerous attributes
 */
export const sanitizeHtml = (html: string): string => {
  if (!html) return '';
  
  return html
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/javascript:/gi, '');
};

/**
 * Validates project key format (alphanumeric, underscore, dash only)
 */
export const validateProjectKey = (projectKey: string): ValidationResult => {
  if (!projectKey) {
    return { isValid: false, error: 'Project key is required' };
  }
  
  if (projectKey.length > 50) {
    return { isValid: false, error: 'Project key must be less than 50 characters' };
  }
  
  const validFormat = /^[a-zA-Z0-9_-]+$/.test(projectKey);
  if (!validFormat) {
    return { isValid: false, error: 'Project key can only contain letters, numbers, underscores, and dashes' };
  }
  
  return { isValid: true };
};

/**
 * Rate limiting utility (simple in-memory implementation)
 */
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private windowMs: number;
  private maxRequests: number;
  
  constructor(windowMs: number = 60000, maxRequests: number = 10) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }
  
  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    if (!this.requests.has(identifier)) {
      this.requests.set(identifier, []);
    }
    
    const userRequests = this.requests.get(identifier)!;
    
    // Remove old requests outside the window
    const validRequests = userRequests.filter(time => time > windowStart);
    
    if (validRequests.length >= this.maxRequests) {
      return false;
    }
    
    validRequests.push(now);
    this.requests.set(identifier, validRequests);
    
    return true;
  }
}

// Export a default rate limiter instance
export const defaultRateLimiter = new RateLimiter(60000, 10); // 10 requests per minute