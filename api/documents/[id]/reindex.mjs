import { handleApi } from '../../../scripts/api.mjs';

export default async function handler(req, res) {
  await handleApi(req, res);
}
