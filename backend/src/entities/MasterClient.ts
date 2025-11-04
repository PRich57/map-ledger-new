import { Entity as Company, PrimaryGeneratedColumn, Column } from 'typeorm';

@Company()
export class MasterClient {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;
}
