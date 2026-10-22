import { handleApi } from '../../../scripts/api.mjs';

export default async function handler(req, res) {
  const handled = await handleApi(req, res);
  if (!handled && !res.writableEnded) {
    res.statusCode = 404;
    res.end('Not found');
  }
}
