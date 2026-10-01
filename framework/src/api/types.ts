/**
 * Zod schemas for ParaBank's JSON API, and the types inferred from them.
 *
 * Shapes here were captured by driving a real browser through each flow and
 * recording the `services_proxy` traffic (see docs/architecture.md), not
 * copied from documentation — ParaBank publishes none for this API.
 */
import { z } from 'zod';

export const accountTypeSchema = z.enum(['CHECKING', 'SAVINGS']);
export type AccountType = z.infer<typeof accountTypeSchema>;

export const accountSchema = z.object({
  id: z.number(),
  customerId: z.number(),
  type: accountTypeSchema,
  balance: z.number(),
});
export type Account = z.infer<typeof accountSchema>;

export const addressSchema = z.object({
  street: z.string(),
  city: z.string(),
  state: z.string(),
  zipCode: z.string(),
});
export type Address = z.infer<typeof addressSchema>;

export const customerSchema = z.object({
  id: z.number(),
  firstName: z.string(),
  lastName: z.string(),
  address: addressSchema,
  phoneNumber: z.string(),
  ssn: z.string(),
});
export type Customer = z.infer<typeof customerSchema>;

/** Fields the register.htm form takes. Not the same shape the API returns. */
export interface NewCustomer {
  firstName: string;
  lastName: string;
  address: Address;
  phoneNumber: string;
  ssn: string;
  username: string;
  password: string;
}

export interface RegisteredCustomer {
  customer: NewCustomer;
  customerId: number;
  /** The account ParaBank opens automatically on registration. */
  checkingAccountId: number;
}

/** `type` as ParaBank's transaction JSON spells it — title case, not upper. */
export const transactionTypeSchema = z.enum(['Debit', 'Credit']);
export type TransactionType = z.infer<typeof transactionTypeSchema>;

export const transactionSchema = z.object({
  id: z.number(),
  accountId: z.number(),
  type: transactionTypeSchema,
  /** Epoch milliseconds. */
  date: z.number(),
  amount: z.number(),
  description: z.string(),
});
export type Transaction = z.infer<typeof transactionSchema>;

export const transactionListSchema = z.array(transactionSchema);

export const billPayResultSchema = z.object({
  payeeName: z.string(),
  amount: z.number(),
  accountId: z.number(),
});
export type BillPayResult = z.infer<typeof billPayResultSchema>;

export interface Payee {
  name: string;
  address: Address;
  phoneNumber: string;
  accountNumber: string;
}

export const loanResponseSchema = z.object({
  responseDate: z.number(),
  loanProviderName: z.string(),
  approved: z.boolean(),
  accountId: z.number(),
});
export type LoanResponse = z.infer<typeof loanResponseSchema>;

/**
 * `services_proxy` reports errors as RFC 7807 problem details. Not every
 * error path returns this shape (a 500 is an HTML error page, caught
 * separately), but the 400s from malformed requests do.
 */
export const problemDetailSchema = z.object({
  title: z.string(),
  status: z.number(),
  detail: z.string(),
  instance: z.string(),
});
export type ProblemDetail = z.infer<typeof problemDetailSchema>;
