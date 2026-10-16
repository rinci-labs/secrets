import { SecretsError } from "../errors.js"
import { AWS_CREDENTIALS, awsClient } from "./aws.js"
import { defineProvider, type Secrets } from "./types.js"

interface Parameter {
  Name: string
  Value: string
}

const MAX_PAGES = 100

/**
 * AWS Systems Manager Parameter Store. Reads every parameter under a path
 * (SecureStrings decrypted), or a chosen list of names. Shares the Secrets
 * Manager provider's SigV4 signing and credential handling.
 */
export const ssm = defineProvider({
  name: "aws-ssm",
  description: "AWS Systems Manager Parameter Store: every parameter under a path, or a list of names.",
  credentials: AWS_CREDENTIALS,
  withhold: [],

  async load(raw, ctx) {
    const { opt, call } = awsClient("aws-ssm", "ssm", raw, ctx)
    const mapping = opt.mapping("parameters")
    const rawPath = opt.string("path")
    if (!rawPath && !mapping) {
      throw new SecretsError('aws-ssm: set "path" or "parameters"', {
        hint: 'e.g. "path": "/myapp/${SECRETS_ENV:-dev}" reads every parameter below it.',
      })
    }

    const out: Secrets = {}
    if (rawPath) {
      const path = `/${rawPath.replace(/^\/+|\/+$/g, "")}`
      const prefix = path === "/" ? "/" : `${path}/`
      let token: string | undefined
      let pages = 0
      do {
        const page = await call<{ Parameters?: Parameter[]; NextToken?: string }>(
          "AmazonSSM.GetParametersByPath",
          {
            Path: path,
            Recursive: opt.boolean("recursive", true),
            WithDecryption: true,
            MaxResults: 10,
            ...(token ? { NextToken: token } : {}),
          },
          `AWS SSM read (${path})`,
        )
        for (const { Name, Value } of page.Parameters ?? []) {
          const name = Name.startsWith(prefix) ? Name.slice(prefix.length) : Name.replace(/^\//, "")
          out[name.replaceAll("/", "_")] = Value
        }
        token = page.NextToken
      } while (token && ++pages < MAX_PAGES)
    }

    if (mapping) {
      const wanted = Object.entries(mapping)
      for (let i = 0; i < wanted.length; i += 10) {
        const chunk = wanted.slice(i, i + 10)
        const result = await call<{ Parameters?: Parameter[]; InvalidParameters?: string[] }>(
          "AmazonSSM.GetParameters",
          { Names: chunk.map(([, name]) => name), WithDecryption: true },
          "AWS SSM read (parameters)",
        )
        if (result.InvalidParameters?.length) {
          throw new SecretsError(`aws-ssm: no parameter named ${result.InvalidParameters.join(", ")}`)
        }
        const byName = new Map((result.Parameters ?? []).map((p) => [p.Name, p.Value]))
        for (const [envName, name] of chunk) {
          const value = byName.get(name)
          if (value !== undefined) out[envName] = value
        }
      }
    }
    return out
  },
})
