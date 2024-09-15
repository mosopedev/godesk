import translateError from "@/utils/mongod.helper";
import userModel from "./user.model";
import IUser from "./user.interface";
import logger from "@/utils/logger";

class UserService {
  public async getUserInfo(userId: string): Promise<IUser> {
    try {
      const userInfo = await userModel.findById(userId)

      if(!userInfo) throw new Error("Unable to retrieve user details.")
      logger(userInfo);

      return userInfo;
    } catch (error: any) {
      logger(error);
      throw new Error(translateError(error)[0] || "Unable to retrieve profile");
    }
  }
}

export default UserService;
