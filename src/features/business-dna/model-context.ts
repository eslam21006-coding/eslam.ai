import { businessDnaFieldNames, type BusinessDnaValues } from "@/features/business-dna/fields";
import {
  buildBoundedBusinessDnaContext,
  MAX_BUSINESS_DNA_CONTEXT_CHARS,
  MAX_BUSINESS_DNA_VALUE_CHARS,
} from "@/features/business-dna/model-context-core";

export { MAX_BUSINESS_DNA_CONTEXT_CHARS, MAX_BUSINESS_DNA_VALUE_CHARS };

export function buildBusinessDnaModelContext(values: BusinessDnaValues) {
  return buildBoundedBusinessDnaContext(
    businessDnaFieldNames.map((field) => [field, values[field]] as const),
  );
}
