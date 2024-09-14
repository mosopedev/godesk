import { model, Schema } from "mongoose";
import IBusiness from "./business.interface";

const BusinessModel = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    uniqueName: { type: String, required: true },
    admin: { type: Schema.ObjectId, ref: "User", required: true },
    parsedKnowledgeBase: { type: String },
    website: { type: String },
    humanOperatorPhoneNumbers: [{ type: String }],
    email: { type: String, required: true },
    country: { type: String, required: true },
    twilioAccount: {
        sid: { type: String },
        dateCreated: { type: Date },
        dateUpdated: { type: Date },
        status: { type: String },
        authToken: { type: String }
    }
  },
  {
    timestamps: true,
  }
);

export default model<IBusiness>("Business", BusinessModel);


