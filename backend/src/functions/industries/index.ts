import { Request, Response } from 'express';

export default async function industries(req: Request, res: Response) {
  res.status(501).json({ message: 'industries endpoint not implemented' });
}
