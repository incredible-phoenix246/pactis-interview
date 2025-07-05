import { Decimal } from 'decimal.js';

export class DecimalTransformer {
  to(data: Decimal): string {
    return data.toString();
  }

  from(data: string): Decimal {
    return new Decimal(data);
  }
}
