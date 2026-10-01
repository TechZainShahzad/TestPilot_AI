/**
 * Typed client for ParaBank's JSON API.
 *
 * Wraps an `APIRequestContext` rather than owning one, so the same class
 * serves two different sessions:
 *   - the `api` project's own context, which this client authenticates
 *     itself (self-registers or logs in via plain HTTP — no browser needed);
 *   - `page.request` in the `ui` project, which shares cookies with the
 *     browser, so UI specs can cross-check a REST response against what the
 *     page just rendered using the exact session the user is in.
 *
 * ParaBank serves two API surfaces under one app:
 *   - `/parabank/services/bank/...`       — mostly XML/SOAP-oriented; the one
 *     exception used here is the anonymous `login/{u}/{p}` customer lookup.
 *   - `/parabank/services_proxy/bank/...` — JSON, and what the Angular-style
 *     pages actually call. Everything but that one lookup requires the
 *     `JSESSIONID` cookie from a UI-equivalent login.
 *
 * Every URL is built as a full absolute string rather than left for
 * Playwright's `baseURL` + relative-path resolution: `new URL('register.htm',
 * 'https://host/parabank')` silently resolves to `https://host/register.htm`
 * per WHATWG URL rules (`/parabank` has no trailing slash, so it is treated
 * as a file, not a directory, and gets replaced). Absolute strings sidestep
 * that footgun entirely.
 *
 * Both `register.htm` and `login.htm` are classic server-rendered form posts
 * — no CSRF token, but the server 500s on a cold POST with no session yet.
 * A GET first establishes the session Struts expects; `ensureSession()`
 * centralises that.
 */
import type { APIRequestContext } from '@playwright/test';

import {
  accountSchema,
  billPayResultSchema,
  customerSchema,
  loanResponseSchema,
  transactionListSchema,
  transactionSchema,
  type Account,
  type AccountType,
  type BillPayResult,
  type Customer,
  type LoanResponse,
  type NewCustomer,
  type Payee,
  type RegisteredCustomer,
  type Transaction,
} from './types.js';

/** `MM-DD-YYYY`, as the Find Transactions date fields require. */
export function toParaBankDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${mm}-${dd}-${String(date.getFullYear())}`;
}

export class RegistrationError extends Error {
  constructor(
    message: string,
    /** Every `<span class="error">` message the re-rendered form contains. */
    public readonly fieldMessages: string[]
  ) {
    super(message);
    this.name = 'RegistrationError';
  }
}

export class LoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoginError';
  }
}

export class ParaBankApiClient {
  constructor(
    private readonly request: APIRequestContext,
    private readonly appUrl: string,
    private readonly apiUrl: string,
    private readonly apiProxyUrl: string
  ) {}

  // ---------------------------------------------------------------- auth --

  /** GETs a page to make sure a `JSESSIONID` cookie exists before a POST. */
  private async ensureSession(path: string): Promise<void> {
    await this.request.get(`${this.appUrl}/${path}`);
  }

  /**
   * Registers a brand-new customer, following the same request sequence a
   * browser makes, and returns the account ParaBank opens automatically.
   * Throws {@link RegistrationError} with the field-level messages the form
   * renders inline if any validation fails.
   */
  async registerCustomer(customer: NewCustomer): Promise<RegisteredCustomer> {
    await this.ensureSession('register.htm');

    const form = new URLSearchParams({
      'customer.firstName': customer.firstName,
      'customer.lastName': customer.lastName,
      'customer.address.street': customer.address.street,
      'customer.address.city': customer.address.city,
      'customer.address.state': customer.address.state,
      'customer.address.zipCode': customer.address.zipCode,
      'customer.phoneNumber': customer.phoneNumber,
      'customer.ssn': customer.ssn,
      'customer.username': customer.username,
      'customer.password': customer.password,
      repeatedPassword: customer.password,
    });

    const response = await this.request.post(`${this.appUrl}/register.htm`, {
      data: form.toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const body = await response.text();

    if (!body.includes('Your account was created successfully')) {
      throw new RegistrationError(
        `Registration failed for username "${customer.username}".`,
        extractFieldMessages(body)
      );
    }

    const registered = await this.getCustomerByCredentials(customer.username, customer.password);
    const accounts = await this.getCustomerAccounts(registered.id);
    const checking = accounts.find((account) => account.type === 'CHECKING');
    if (!checking) {
      throw new Error(
        `Registered "${customer.username}" but no CHECKING account was opened automatically.`
      );
    }

    return { customer, customerId: registered.id, checkingAccountId: checking.id };
  }

  /**
   * Logs in via the same form the UI posts to. Throws {@link LoginError}
   * with ParaBank's own error text (e.g. "The username and password could
   * not be verified.") on failure.
   */
  async login(username: string, password: string): Promise<void> {
    await this.ensureSession('index.htm');

    const form = new URLSearchParams({ username, password });
    const response = await this.request.post(`${this.appUrl}/login.htm`, {
      data: form.toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const body = await response.text();

    const errorMatch = /<p class="error">\s*([^<]+?)\s*<\/p>/.exec(body);
    if (errorMatch?.[1] !== undefined) {
      throw new LoginError(errorMatch[1].trim());
    }
  }

  /**
   * The one anonymous read `/services` exposes: a customer by credentials.
   * Requires no session, but does require the credentials to be correct —
   * ParaBank returns a plain-text `400`, not JSON, on failure.
   */
  async getCustomerByCredentials(username: string, password: string): Promise<Customer> {
    const response = await this.request.get(
      `${this.apiUrl}/bank/login/${encodeURIComponent(username)}/${encodeURIComponent(password)}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!response.ok()) {
      throw new LoginError(`Credential lookup failed for "${username}": ${await response.text()}`);
    }
    return customerSchema.parse(await response.json());
  }

  // ------------------------------------------------------------ accounts --

  async getAccount(accountId: number): Promise<Account> {
    const response = await this.request.get(`${this.apiProxyUrl}/accounts/${String(accountId)}`, {
      headers: { Accept: 'application/json' },
    });
    return accountSchema.parse(await response.json());
  }

  async getCustomerAccounts(customerId: number): Promise<Account[]> {
    const response = await this.request.get(
      `${this.apiProxyUrl}/customers/${String(customerId)}/accounts`,
      { headers: { Accept: 'application/json' } }
    );
    return accountSchema.array().parse(await response.json());
  }

  /** `type: 0` opens CHECKING, `type: 1` opens SAVINGS — ParaBank's own enum. */
  async openAccount(
    customerId: number,
    type: AccountType,
    fromAccountId: number
  ): Promise<Account> {
    const newAccountType = type === 'CHECKING' ? 0 : 1;
    const response = await this.request.post(
      `${this.apiProxyUrl}/createAccount` +
        `?customerId=${String(customerId)}&newAccountType=${String(newAccountType)}&fromAccountId=${String(fromAccountId)}`,
      { headers: { Accept: 'application/json' } }
    );
    return accountSchema.parse(await response.json());
  }

  // -------------------------------------------------------- transactions --

  async getTransactions(accountId: number): Promise<Transaction[]> {
    const response = await this.request.get(
      `${this.apiProxyUrl}/accounts/${String(accountId)}/transactions`,
      { headers: { Accept: 'application/json' } }
    );
    return transactionListSchema.parse(await response.json());
  }

  async getTransactionById(transactionId: number): Promise<Transaction | undefined> {
    const response = await this.request.get(
      `${this.apiProxyUrl}/transactions/${String(transactionId)}`,
      { headers: { Accept: 'application/json' } }
    );
    if (response.status() === 404) return undefined;
    return transactionSchema.parse(await response.json());
  }

  async getTransactionsByAmount(accountId: number, amount: number): Promise<Transaction[]> {
    const response = await this.request.get(
      `${this.apiProxyUrl}/accounts/${String(accountId)}/transactions/amount/${amount.toFixed(2)}`,
      { headers: { Accept: 'application/json' } }
    );
    return transactionListSchema.parse(await response.json());
  }

  async getTransactionsByDate(accountId: number, date: Date): Promise<Transaction[]> {
    const response = await this.request.get(
      `${this.apiProxyUrl}/accounts/${String(accountId)}/transactions/onDate/${toParaBankDate(date)}`,
      { headers: { Accept: 'application/json' } }
    );
    return transactionListSchema.parse(await response.json());
  }

  async getTransactionsByDateRange(
    accountId: number,
    from: Date,
    to: Date
  ): Promise<Transaction[]> {
    const response = await this.request.get(
      `${this.apiProxyUrl}/accounts/${String(accountId)}/transactions/fromDate/${toParaBankDate(from)}/toDate/${toParaBankDate(to)}`,
      { headers: { Accept: 'application/json' } }
    );
    return transactionListSchema.parse(await response.json());
  }

  // -------------------------------------------------------------- money --

  /**
   * Returns ParaBank's plain-text confirmation message.
   *
   * No typed result here deliberately: ParaBank's `services_proxy` performs
   * **no server-side validation of `amount`** — negative, zero, and
   * balance-exceeding transfers all return `200` with a success message. See
   * "Known application limitations" in docs/architecture.md. Callers that
   * want to assert the business rule anyway should use `test.fail()`, as the
   * regression specs do.
   */
  async transfer(fromAccountId: number, toAccountId: number, amount: number): Promise<string> {
    const response = await this.request.post(
      `${this.apiProxyUrl}/transfer` +
        `?fromAccountId=${String(fromAccountId)}&toAccountId=${String(toAccountId)}&amount=${amount.toFixed(2)}`,
      { headers: { Accept: 'application/json' } }
    );
    return response.text();
  }

  async billPay(payee: Payee, fromAccountId: number, amount: number): Promise<BillPayResult> {
    const response = await this.request.post(
      `${this.apiProxyUrl}/billpay?accountId=${String(fromAccountId)}&amount=${amount.toFixed(2)}`,
      {
        data: {
          name: payee.name,
          address: payee.address,
          phoneNumber: payee.phoneNumber,
          accountNumber: payee.accountNumber,
        },
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      }
    );
    return billPayResultSchema.parse(await response.json());
  }

  /**
   * Returns ParaBank's decision. This demo deployment's `requestLoan`
   * approves unconditionally — verified by requesting from a zero-balance
   * account with no down payment and a six-figure amount, and it still came
   * back `approved: true`. See "Known application limitations" in
   * docs/architecture.md; the "denied" spec documents this with `test.fail()`
   * rather than asserting a result the live app cannot produce.
   */
  async requestLoan(
    customerId: number,
    amount: number,
    downPayment: number,
    fromAccountId: number
  ): Promise<LoanResponse> {
    const response = await this.request.post(
      `${this.apiProxyUrl}/requestLoan` +
        `?customerId=${String(customerId)}&amount=${amount.toFixed(2)}&downPayment=${downPayment.toFixed(2)}&fromAccountId=${String(fromAccountId)}`,
      { headers: { Accept: 'application/json' } }
    );
    return loanResponseSchema.parse(await response.json());
  }
}

/**
 * register.htm re-renders the form with a `<span class="error">` next to
 * every invalid field. This is a diagnostic best-effort extraction for the
 * thrown exception's message, not a parsed contract — tests that need to
 * assert specific field errors do so through {@link RegisterPage} against
 * the real DOM, not this regex.
 */
function extractFieldMessages(html: string): string[] {
  const messages: string[] = [];
  for (const match of html.matchAll(/<span class="error">\s*([^<]+?)\s*<\/span>/g)) {
    const message = match[1];
    if (message !== undefined && message.length > 0) messages.push(message);
  }
  return messages;
}
