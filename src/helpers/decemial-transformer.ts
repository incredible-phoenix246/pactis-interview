import { Decimal } from 'decimal.js';

export class DecimalTransformer {
  to(data: Decimal): string | null {
    if (!data) return null;
    return data.toString();
  }

  from(data: string): Decimal | null {
    if (!data) return null;
    return new Decimal(data);
  }
}
