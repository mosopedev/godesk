import { model, Schema, SchemaType } from "mongoose";
import IAuth from "./auth.interface";

const AuthModel = new Schema(
    {
        userId: {
            type: Schema.ObjectId,
            required: true,
            ref: 'User'
        },
        refreshToken: {
            type: String,
            required: true
        },
        expireAt: { type: Date, default: Date.now() + 30 * 24 * 60 * 60 * 1000 , index: { expires: '30d' } } // document is deleted after 30 days
    },
    {
        timestamps: true,
    }
);

export default model<IAuth>('Auth', AuthModel)
