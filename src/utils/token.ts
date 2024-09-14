import jwt from 'jsonwebtoken'
import { ObjectId } from 'mongoose'
import Token from '../interfaces/token.interface'
import logger from './logger'

export const generateToken = async (userId: string | ObjectId, isAccessToken: boolean) => {
    const secretKey: string | undefined = isAccessToken === true ? process.env.ACCESS_TOKEN_PRIVATE_KEY : process.env.REFRESH_TOKEN_PRIVATE_KEY
    const expiresIn: string = isAccessToken === true ? '1d' : '30d'

    return jwt.sign({ id: userId }, secretKey as jwt.Secret, { expiresIn })
}

export const verifyToken = async (
    token: string, isAccessToken: boolean
): Promise<jwt.VerifyErrors | jwt.JwtPayload | string | any> => {
    const secretKey = isAccessToken == true ? process.env.ACCESS_TOKEN_PRIVATE_KEY : process.env.REFRESH_TOKEN_PRIVATE_KEY

    try {
        const payload = jwt.verify(token, secretKey as jwt.Secret);
        return payload;
    } catch (err) {
        return err
    }

}; 