import { cleanEnv, str, port, bool } from 'envalid'

function validateEnv(): void {
    cleanEnv(process.env, {
        NODE_ENV: str({
            choices: ['development', 'production']
        }),
        MONGODB_URI_DEV: str(),
        TWILIO_ACCOUNT_SID: str(),
        TWILIO_AUTH_TOKEN: str(),
        ACCESS_TOKEN_PRIVATE_KEY: str(),
        REFRESH_TOKEN_PRIVATE_KEY: str()
    })
}

export default validateEnv