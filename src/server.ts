import 'dotenv/config'
import 'module-alias/register'
import validateEnv from './utils/validateEnv'
import App from './app'
import AuthController from './resources/auth/auth.controller'
import UserController from './resources/user/user.controller'
import AgentController from './resources/agent/agent.controller'
import UsageController from './resources/usage/usage.controller'
import BusinessController from './resources/business/business.controller'

const app = new App([new AuthController, new BusinessController, new UserController, new AgentController, new UsageController], Number(process.env.PORT) || 4000)

validateEnv()
app.startServer()

export default {}