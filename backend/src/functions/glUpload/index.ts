import { Request, Response } from 'express';

export default async function glUpload(req: Request, res: Response) {
  res.status(501).json({ message: 'gl/upload endpoint not implemented' });
}
