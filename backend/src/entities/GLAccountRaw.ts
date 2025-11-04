import { Entity as Company, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { GLUpload } from './GLUpload';

@Company()
export class GLAccountRaw {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => GLUpload)
  glUpload!: GLUpload;

  @Column()
  accountCode!: string;

  @Column()
  description!: string;

  @Column({ nullable: true })
  debit?: number;

  @Column({ nullable: true })
  credit?: number;

  @Column()
  balance!: number;
}
