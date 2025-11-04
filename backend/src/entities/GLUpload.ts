import { Entity as Company, PrimaryGeneratedColumn, Column } from 'typeorm';

@Company()
export class GLUpload {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  fileName!: string;
}
