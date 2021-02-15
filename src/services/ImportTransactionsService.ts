import {getCustomRepository, getRepository, In} from 'typeorm';
import csvParse from 'csv-parse';
import fs from 'fs';

import Transaction from '../models/Transaction';
import Category from '../models/Category';

import TransactionsRepository from '../repositories/TransactionsRepository';

interface CSVTransacion{
  title: string;
  type: 'income' | 'outcome';
  value : number;
  category : string;
}

class ImportTransactionsService {
  async execute(filePath : string): Promise<Transaction[]> {
    const transactionRepository =  getCustomRepository(TransactionsRepository);
    const categoriesRepository = getRepository(Category);

    const contactsReacStream = fs.createReadStream(filePath);

    const parses = csvParse({
      delimiter : ',',
      from_line: 2,
    });

    const parseCSV = contactsReacStream.pipe(parses);
    const transactions: CSVTransacion[] = [];
    const categories: string[] = [];
    
    parseCSV.on('data', async line => {
      const[title, type, value, category] = line.map((cell: string) => 
        cell.trim(),
      );
      if(!title || !type || !value ) return ;

      categories.push(category);
      transactions.push({title, type, value, category});
    })

    await new Promise(resolve => parseCSV.on('end', resolve));

    const existCategories = await categoriesRepository.find({
      where : {
        title: In(categories),
      }
    });

    const existentCategoriesTitles = existCategories.map(
      (category: Category) => category.title
    );

    const addCategoryTitles = categories.filter(
        category => !existentCategoriesTitles.includes(category),
    ).filter((value, index, self) => self.indexOf(value) == index);

    const newCategories = categoriesRepository.create(
      addCategoryTitles.map(title => ({
        title, 
      })),
    );
    await categoriesRepository.save(newCategories);

    const finalCategories = [... newCategories, ...existCategories];

    const createdTransactions = transactionRepository.create(
      transactions.map(transaction => ({
          title: transaction.title, 
          type: transaction.type, 
          value: transaction.value,
          category: finalCategories.find(
            category => category.title == transaction.category,
          ),
      })),
    );

    await transactionRepository.save(createdTransactions);

    await fs.promises.unlink(filePath);

    return createdTransactions;

  }
}

export default ImportTransactionsService;
