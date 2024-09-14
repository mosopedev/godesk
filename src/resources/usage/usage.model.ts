import { model, Schema } from "mongoose";
import IUsage from "./usage.interface";

const UsageModel = new Schema(
  {
    promptTokens: { type: Number, required: true },
    completionTokens:  { type: Number, required: true },
    totalTokens:  { type: Number, required: true },
    totalPrice:  { type: Number, required: true },
    currency:  { type: String, default: 'USD', required: true },
    businessId: { type: Schema.ObjectId, ref: 'Business', required: true },
    threadId: { type: String, required: true },
    agentId: { type: Schema.ObjectId, ref: 'Agent', required: true }
  },
  {
    timestamps: true,
  }
);

export default model<IUsage>("Usage", UsageModel);


