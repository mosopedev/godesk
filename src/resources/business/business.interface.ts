export default interface IBusiness {
  name: string;
  uniqueName: string;
  admin: string;
  parsedKnowledgeBase?: string;
  website?: string;
  humanOperatorPhoneNumbers?: string[];
  email: string;
  country: string;
  twilioAccount: {
    sid: string;
    dateCreated: Date;
    dateUpdated: Date;
    status: string;
    authToken: string;
  };
}
