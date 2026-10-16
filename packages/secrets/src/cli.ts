#!/usr/bin/env node
import { main, reportError } from "./commands.js"

process.exitCode = await main(process.argv.slice(2)).catch(reportError)
