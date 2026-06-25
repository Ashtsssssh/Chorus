/**
 * Input Validation Utility
 * Provides comprehensive validation with clear, user-friendly error messages
 */

class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.field = field;
    this.isValidationError = true;
  }
}

// Email regex pattern
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Validation functions with descriptive error messages
const validators = {
  username: (value) => {
    if (!value) {
      throw new ValidationError('Username is required', 'username');
    }
    if (typeof value !== 'string') {
      throw new ValidationError('Username must be text', 'username');
    }
    if (value.length < 3) {
      throw new ValidationError('Username must be at least 3 characters long', 'username');
    }
    if (value.length > 20) {
      throw new ValidationError('Username cannot exceed 20 characters', 'username');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
      throw new ValidationError('Username can only contain letters, numbers, underscores, and hyphens', 'username');
    }
    return true;
  },

  email: (value) => {
    if (!value) {
      throw new ValidationError('Email is required', 'email');
    }
    if (typeof value !== 'string') {
      throw new ValidationError('Email must be text', 'email');
    }
    if (!EMAIL_REGEX.test(value)) {
      throw new ValidationError('Please enter a valid email address (example: user@example.com)', 'email');
    }
    if (value.length > 100) {
      throw new ValidationError('Email is too long (maximum 100 characters)', 'email');
    }
    return true;
  },

  password: (value, minLength = 8) => {
    if (!value) {
      throw new ValidationError('Password is required', 'password');
    }
    if (typeof value !== 'string') {
      throw new ValidationError('Password must be text', 'password');
    }
    if (value.length < minLength) {
      throw new ValidationError(
        `Password must be at least ${minLength} characters long (you entered ${value.length})`,
        'password'
      );
    }
    if (value.length > 128) {
      throw new ValidationError('Password is too long (maximum 128 characters)', 'password');
    }
    // Optional: Check for complexity
    // if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(value)) {
    //   throw new ValidationError(
    //     'Password must contain uppercase, lowercase, and numbers',
    //     'password'
    //   );
    // }
    return true;
  },

  jobName: (value) => {
    if (!value) {
      throw new ValidationError('Job name is required', 'jobName');
    }
    if (typeof value !== 'string') {
      throw new ValidationError('Job name must be text', 'jobName');
    }
    if (value.trim().length === 0) {
      throw new ValidationError('Job name cannot be empty or just spaces', 'jobName');
    }
    if (value.length > 100) {
      throw new ValidationError('Job name cannot exceed 100 characters', 'jobName');
    }
    return true;
  },

  jobDescription: (value) => {
    if (value === undefined || value === null) {
      return true; // Description is optional
    }
    if (typeof value !== 'string') {
      throw new ValidationError('Job description must be text', 'description');
    }
    if (value.length > 1000) {
      throw new ValidationError('Job description cannot exceed 1000 characters', 'description');
    }
    return true;
  },

  sourceFile: (file) => {
    if (!file) {
      throw new ValidationError('Source file is required', 'sourceFile');
    }
    if (!file.buffer || !file.filename) {
      throw new ValidationError('Invalid file upload', 'sourceFile');
    }
    // Check file size (max 50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.buffer.length > maxSize) {
      throw new ValidationError(
        `File is too large (${(file.buffer.length / 1024 / 1024).toFixed(2)}MB). Maximum size is 50MB`,
        'sourceFile'
      );
    }
    return true;
  },

  jobId: (value) => {
    if (!value) {
      throw new ValidationError('Job ID is required', 'jobId');
    }
    if (typeof value !== 'string') {
      throw new ValidationError('Job ID must be text', 'jobId');
    }
    if (!/^[a-f0-9]{24}$/.test(value)) {
      throw new ValidationError('Invalid Job ID format', 'jobId');
    }
    return true;
  },

  chunkIndex: (value) => {
    if (value === undefined || value === null) {
      throw new ValidationError('Chunk index is required', 'chunkIndex');
    }
    const index = parseInt(value, 10);
    if (isNaN(index)) {
      throw new ValidationError('Chunk index must be a number', 'chunkIndex');
    }
    if (index < 0) {
      throw new ValidationError('Chunk index cannot be negative', 'chunkIndex');
    }
    return true;
  },

  visibility: (value) => {
    const validValues = ['public', 'private', 'protected'];
    if (!value) {
      throw new ValidationError('Visibility setting is required', 'visibility');
    }
    if (!validValues.includes(value)) {
      throw new ValidationError(
        `Visibility must be one of: ${validValues.join(', ')}`,
        'visibility'
      );
    }
    return true;
  },
};

/**
 * Validation middleware factory
 * Usage: app.post('/endpoint', validate('field1', 'field2'), handler)
 */
const validate = (...fieldRules) => {
  return (req, res, next) => {
    try {
      fieldRules.forEach(rule => {
        if (typeof rule === 'string') {
          // Simple field validation (uses default validator)
          if (validators[rule]) {
            validators[rule](req.body[rule]);
          }
        } else if (typeof rule === 'object') {
          // Object with custom rules: { field: 'fieldName', validator: validatorFn }
          const { field, validator } = rule;
          validator(req.body[field]);
        }
      });
      next();
    } catch (error) {
      if (error.isValidationError) {
        return res.status(400).json({
          error: error.message,
          field: error.field,
        });
      }
      next(error);
    }
  };
};

module.exports = {
  ValidationError,
  validators,
  validate,
};
