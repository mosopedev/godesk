import logger from '@/utils/logger'
import { Request, Response, NextFunction, RequestHandler } from 'express'
import HttpException from '../exceptions/http.exception'
import Joi from 'joi'

function validationMiddleware(schema: Joi.Schema): RequestHandler {
    return async(req: Request, res: Response, next: NextFunction): Promise<void> => {
        const validationOptions = {
            abortEarly: false,
            allowUnknown: false,
            stripUnkown: true
        }

        try {
            const value = await schema.validateAsync(req.body, validationOptions)
            req.body = value
            next()
        } catch (err: any) {
            const errors: string[] = []
            err.details.forEach((error: Joi.ValidationErrorItem) => {
                errors.push(error.message)
            })
            res.status(400).send({
                success: false,
                errors
            })
        }
    }
}

export default validationMiddleware