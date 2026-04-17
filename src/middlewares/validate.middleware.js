import Joi from 'joi';
import AppError from '../utils/AppError.js';

const validate = schema => (req, res, next) => {
    const { value, error } = schema.validate(req.body);

    if (error) {
        const errorMessage = error.details.map(detail => detail.message).join(', ');
        return next(new AppError(errorMessage, 400));
    }

    Object.assign(req, value);
    return next();
};

export default validate;
