import { verifyDeployment } from './verify-deployment-lib.mjs'

const target = process.argv[2] ?? process.env.NABU_DEPLOYMENT_URL
if (!target) {
  throw new Error('Pass the deployment origin, for example: npm run verify:deployment -- https://nabu.example')
}

const result = await verifyDeployment(target)
console.log(`Verified ${result.baseUrl}: ${result.assets.length} local assets and application health`)
