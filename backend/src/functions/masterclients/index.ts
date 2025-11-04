import { Request, Response } from 'express';

export default async function masterclients(req: Request, res: Response) {
  res.status(501).json({ message: 'masterclients endpoint not implemented' });
}
