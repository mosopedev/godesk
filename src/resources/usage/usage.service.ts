import businessModel from "../business/business.model";
import IUsage from "./usage.interface";
import twilio from "twilio";
import { ObjectId } from "mongodb";
import OpenAI from "openai";
import usageModel from "./usage.model";
import logger from "@/utils/logger";

class UsageService {
  public async addTokenUsage(
    usage: OpenAI.Beta.Threads.Run.Usage,
    businessId: string,
    threadId: string,
    agentId: string
  ): Promise<IUsage> {
    try {
      const usageData = await usageModel.create({
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        totalPrice:
          ((usage.prompt_tokens / 1000) * 0.00015 +
            (usage.completion_tokens / 1000) * 0.0006) *
          100,
        businessId,
        threadId,
        agentId
      });

      return usageData;
    } catch (error: any) {
      throw new Error(error || "Unable to log token usage.");
    }
  }

  public async getTotalBusinessUsage(businessId: string) {
    try {
      const business = await businessModel.findById(businessId);

      if (!business) throw new Error("Business not found.");

      const totalTokenUsage = await usageModel.aggregate([
        {
          $match: { businessId: new ObjectId(businessId) },
        },
        {
          $group: {
            _id: "businessId",
            total: { $sum: "$totalPrice" },
          },
        },
      ]);

      const subTwilioClient = twilio(
          business.twilioAccount.sid,
          business.twilioAccount.authToken
      );

      const calls = await subTwilioClient.calls.list();
      logger(calls[0]);

      let totalCallUsage = 0;
      calls.forEach((call) => {
        // convert dollar unit to cents
        totalCallUsage += Number(call.price) * 100;
      });

      if (!totalTokenUsage || !calls)
        throw new Error("Unable to retrieve total usage");

      return {
        callUsage: totalCallUsage,
        tokenUsage: totalTokenUsage[0]?.total || 0,
      };
    } catch (error: any) {
      throw new Error(error.message || "Unable to retrieve total usage.");
    }
  }

  public async getBusinessCallUsage(businessId: string) {
    try {
      const business = await businessModel.findById(businessId);

      if (!business) throw new Error("Business not found.");

      const subTwilioClient = twilio(
        business.twilioAccount.sid,
        business.twilioAccount.authToken
      );

      const calls = await subTwilioClient.calls.list();

      return calls;
    } catch (error: any) {
      throw new Error(error.message || "Unable to retrieve call usage.");
    }
  }
}

export default UsageService;
