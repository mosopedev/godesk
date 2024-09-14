import { Request, Response, NextFunction } from 'express'
import * as token from '@/utils/token'
import Token from '@/interfaces/token.interface'
import HttpException from '../exceptions/http.exception'
import jwt from 'jsonwebtoken'
import logger from '@/utils/logger'
import authModel from '@/resources/auth/auth.model'
import IAuth from '@/resources/auth/auth.interface'

async function authenticatedMiddleware(
    req: Request | any,
    res: Response,
    next: NextFunction
): Promise<Response | void> {
    const bearer = req.headers.authorization
    const refreshToken = req.cookies?.refreshToken
    

    if (!bearer || !bearer.startsWith('Bearer ') || !refreshToken) {
        logger('Unauthorized - Auth token required')
        return next(new HttpException(401, 'Session expired. Login to continue'))
    }

    const accessToken = bearer.split('Bearer ')[1].trim()

    try {
        const payload: Token | jwt.JwtPayload | jwt.JsonWebTokenError = await token.verifyToken(accessToken, true)
        const refreshTokenPayload: jwt.JwtPayload | jwt.JsonWebTokenError = await token.verifyToken(refreshToken, false)

        // both refresh and access token are expired. login required
        if (payload instanceof jwt.JsonWebTokenError && refreshTokenPayload instanceof jwt.JsonWebTokenError) {
            logger('Both tokens expired')
            return next(new HttpException(401, 'Session has expired. Please login to continue.'))
        }

        if (!(payload instanceof jwt.JsonWebTokenError) && refreshTokenPayload instanceof jwt.JsonWebTokenError) {
            logger('Refresh token expired')
            return next(new HttpException(401, 'Session has expired. Please login to continue.'))
        }

        // Access token expired but Refresh token valid
        if(payload instanceof jwt.JsonWebTokenError && !(refreshTokenPayload instanceof jwt.JsonWebTokenError)) {
            //  find and delete recent refreshToken
            const currentSession: IAuth | null = await authModel.findOne({userId: refreshTokenPayload.id})

            if(!currentSession){
                logger("No currentSession. 30days have passed.")
                return next(new HttpException(401, 'Session has expired. Please login to continue'))
            } 
            
            if(currentSession.refreshToken !== refreshToken) {
                logger('Unauthorized - refresh tokens do not match')
                return next(new HttpException(401, 'Session has expired. Please login to continue.'))
            }

            logger('generated new access token')
            const accessToken = await token.generateToken(refreshTokenPayload.id, true)
            
            req.user = refreshTokenPayload.id

            res.setHeader('Authorization', `Bearer ${accessToken}`);
            return next()      
        }

        if (!(payload instanceof jwt.JsonWebTokenError) && !(refreshTokenPayload instanceof jwt.JsonWebTokenError)) {
            
            const currentSession: IAuth | null = await authModel.findOne({userId: refreshTokenPayload.id})
            
            if(!currentSession){
                logger("No currentSession. 30days have passed.")
                return next(new HttpException(401, 'Session has expired. Please login to continue'))
            } 

            req.user = payload.id
            return next()
        }

    } catch (error: any) {
        logger(error)
        return next(new HttpException(401, error.message || 'Your session has expired. Login to continue'))
    }
}

export default authenticatedMiddleware