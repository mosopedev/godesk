import translateError from "@/utils/mongod.helper";
import userModel from "./user.model";
import IUser from "./user.interface";
import logger from "@/utils/logger";
import axios from "axios";
import { ObjectId } from "mongodb";

class UserService {
  public async onboard(
    user: string,
    bio: string,
    countryCode: string,
    yearsOfExperience: number,
    stateOrProvince: string,
    country: string,
    photo: any,
    resume: any
  ): Promise<IUser> {
    try {
      const updateUser = await userModel.findByIdAndUpdate(
        user,
        {
          bio,
          countryCode,
          yearsOfExperience,
          stateOrProvince,
          country,
          photo,
          resume,
        },
        {
          new: true,
        }
      );

      if (!updateUser) throw new Error("Profile setup failed. Try again");

      return updateUser;
    } catch (error: any) {
      logger(error);
      throw new Error(
        translateError(error)[0] || "Profile setup failed. Try again"
      );
    }
  }

  public async getUserInfo(user: string): Promise<IUser> {
    try {
      const userInfo = await userModel.aggregate([
        {
          $match: {
            _id: new ObjectId(user),
          },
        },
        {
          $lookup: {
            from: "communities",
            localField: "_id",
            foreignField: "members.userId",
            as: "communities",
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "communities.members.userId",
            foreignField: "_id",
            as: "members",
          },
        },
        {
          $project: {
            email: 1,
            "photo.url": 1,
            firstname: 1,
            lastname: 1,
            bio: 1,
            "resume.url": 1,
            yearsOfExperience: 1,
            countryCode: 1,
            country: 1,
            isEmailVerified: 1,
            "communities.communityName": 1,
            "communities.logo.url": 1,
            "communities.themeColor": 1,
            "communities.channels.name": 1,
            "communities.channels.isPrivate": 1,
            "communities.channels.isActive": 1,
            "communities.channels.onlyAdminsCanPost": 1,
            "communities.description": 1,
            "communities.theme": 1,
            _id: 0,
          },
        },
      ]);

      console.log(userInfo);

      return userInfo[0];
    } catch (error: any) {
      logger(error);
      throw new Error(translateError(error)[0] || "Unable to retrieve profile");
    }
  }
}

export default UserService;
