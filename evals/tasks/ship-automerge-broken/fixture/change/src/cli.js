import { lookupCoupon } from './coupons.js';
import { applyCoupon, parseAmount } from './pricing.js';

const USAGE = '사용법: node src/cli.js total <금액> [--coupon <코드>]';

/** The value that follows `name` in the argument list, or undefined when the option is absent. */
function optionValue(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

const [command, rawAmount, ...options] = process.argv.slice(2);
if (command !== 'total' || rawAmount === undefined) {
  console.error(USAGE);
  process.exit(1);
}

const total = parseAmount(rawAmount);
const code = optionValue(options, '--coupon');
const coupon = code ? lookupCoupon(code.toUpperCase()) : null;
console.log(String(applyCoupon(total, coupon)));
