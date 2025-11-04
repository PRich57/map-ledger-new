import { Entity as Company, PrimaryGeneratedColumn, Column } from 'typeorm';

@Company()
export class Industry {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;
}
