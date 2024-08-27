const fs = require('fs');
const Time = require('./Time');

function TextDayFormat(num){
    //проверка данных
    if(typeof num !== 'number') throw new Error('Неверны формат дней');

    //по умолчанию
    let textDayFormat = '';

    if (num.toString().length > 1 && num.toString().slice(-2).charAt(0) === '1') {
        // Для чисел, заканчивающихся на 11-19
        textDayFormat = `${num} Дней`;
      } else if (num % 10 >= 5 || num % 10 === 0) {
        // Для чисел, заканчивающихся на 5-9 или 0
        textDayFormat = `${num} Дней`;
      } else if (num % 10 >= 2 && num % 10 <= 4) {
        // Для чисел, заканчивающихся на 2-4
        textDayFormat = `${num} Дня`;
      } else {
        // Для чисел, заканчивающихся на 1
        textDayFormat = `${num} День`;
      }
    
      return textDayFormat;
}

function FormatBytes(bytes) {
  if (bytes === 0) return '0 Б';

  const sizes = ['Б', 'Кб', 'Мб', 'Гб', 'Тб', 'Пб'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const formattedSize = (bytes / Math.pow(1024, i)).toFixed(2); // Округляем до 2 знаков после запятой

  return `${formattedSize} ${sizes[i]}`;
}

function Buttons(keyboard){

    //проверка данныых
    if(!(keyboard instanceof Array) || keyboard.length === 0) throw new Error('Неверны формат кнопок');

    //формирование кнопок
    return {
        reply_markup: {
            inline_keyboard: keyboard
        }
    };
}

function WriteInLogFile(messageOrError){

  //информация для лога
  const time = new Time().fromUnix(true);
  const isError = messageOrError instanceof Error;
  let logClause = '', detailClause = '', messageLog = '';

  if(isError){
      //информация об ошибке
      logClause = ` [ERROR]: ${messageOrError.message}`;
      detailClause = messageOrError.stack ? `\n[DETAIL]: ${messageOrError.stack}` : '';
  }
  else logClause = ` [INFO]: ${messageOrError}`;

  //сообщение для лога
  messageLog = `[${time}]${logClause}${detailClause}\n`;

  //вывод в консоль
  console.log(messageLog);

  try {
      fs.appendFileSync('logs.txt', messageLog + '\n');

  } catch (err) {
      console.error(`Не удалось добавить лог: '${messageLog}'`, err);
  }
}

//управлаение состоянием
function STATE(state) {
  // Сохраняем копию исходного состояния для сброса
  let default_state = { ...state };
  return {
      ...state,
      default() {
          // Восстанавливаем все поля к значениям из default_state
          Object.keys(default_state).forEach(key => {
              this[key] = default_state[key];
          });
      },
      update(newState) {
        default_state = newState;
        this.default();
      }
  };
}

module.exports = {TextDayFormat, Buttons, FormatBytes, WriteInLogFile, STATE}