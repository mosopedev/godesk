import { Schema } from 'mongoose';

type Token = {
    exp: number;
    id: Schema.Types.ObjectId;
}

export default Token;