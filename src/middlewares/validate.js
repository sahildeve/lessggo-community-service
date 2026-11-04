// Validates req.params, req.query and req.body with Joi, and puts Joi's
// cleaned values back on req (COMM-15). Unknown fields are dropped, so
// extra fields from the app never break a request.
export const validate = (schemas) => (req, res, next) => {
  for (const part of ["params", "query", "body"]) {
    const schema = schemas[part];
    if (!schema) continue;

    const { error, value } = schema.validate(req[part] ?? {}, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: error.details.map((d) => ({
          field: d.path.join("."),
          message: d.message,
        })),
      });
    }

    if (part === "body") {
      req.body = value;
    } else {
      // Express 5 exposes req.query through a getter, so it cannot be
      // reassigned; define our own property with the validated values.
      Object.defineProperty(req, part, {
        value,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }
  }
  next();
};
