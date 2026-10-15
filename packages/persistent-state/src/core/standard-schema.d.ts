// Vendored from @standard-schema/spec 1.1.0 (https://github.com/standard-schema/standard-schema), MIT License, (c) 2024 Colin McDonnell.

/** The Standard Schema interface (v1), implemented by zod, valibot, arktype and other validation libraries. */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  /** The Standard Schema properties. */
  readonly '~standard': StandardSchemaV1.Props<Input, Output>
}

export declare namespace StandardSchemaV1 {
  /** The Standard Schema properties interface. */
  interface Props<Input = unknown, Output = Input> {
    /** The version number of the standard. */
    readonly version: 1
    /** The vendor name of the schema library. */
    readonly vendor: string
    /** Inferred types associated with the schema. */
    readonly types?: Types<Input, Output> | undefined
    /** Validates unknown input values. */
    readonly validate: (value: unknown, options?: StandardSchemaV1.Options) => Result<Output> | Promise<Result<Output>>
  }

  /** The result of the validate function. */
  type Result<Output> = SuccessResult<Output> | FailureResult

  /** The result if validation succeeds. */
  interface SuccessResult<Output> {
    /** The typed output value. */
    readonly value: Output
    /** The absence of issues indicates success. */
    readonly issues?: undefined
  }

  /** Options of the validate function. */
  interface Options {
    /** Implicit support for additional vendor-specific parameters, if needed. */
    readonly libraryOptions?: Record<string, unknown> | undefined
  }

  /** The result if validation fails. */
  interface FailureResult {
    /** The issues of failed validation. */
    readonly issues: ReadonlyArray<Issue>
  }

  /** An issue of a failed validation. */
  interface Issue {
    /** The error message of the issue. */
    readonly message: string
    /** The path of the issue, if any. */
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined
  }

  /** A path segment of an issue. */
  interface PathSegment {
    /** The key representing a path segment. */
    readonly key: PropertyKey
  }

  /** The input and output types of a schema. */
  interface Types<Input = unknown, Output = Input> {
    /** The input type of the schema. */
    readonly input: Input
    /** The output type of the schema. */
    readonly output: Output
  }

  /** Infers the input type of a Standard Schema. */
  type InferInput<Schema extends StandardSchemaV1> = NonNullable<Schema['~standard']['types']>['input']

  /** Infers the output type of a Standard Schema. */
  type InferOutput<Schema extends StandardSchemaV1> = NonNullable<Schema['~standard']['types']>['output']
}
