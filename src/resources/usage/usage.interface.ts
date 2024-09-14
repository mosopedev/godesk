export default interface IUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  totalPrice: number;
  currency: string;
  businessId: string;
  threadId: string;
  agentId: string;
}
  