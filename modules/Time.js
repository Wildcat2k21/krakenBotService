class Time{

    constructor(shortUnix){

        //проверка корректности
        if (typeof shortUnix !== 'number' && shortUnix) {
            throw new Error(`Некорретное время: '${shortUnix}'. Укажите Unix-время в секундах`);
        }

        this.time = shortUnix || Math.ceil(Date.now() / 1000);
    }

    //формат ISO 8601: YY-MM-DD
    fromUnix(fulltime = false){
        const date = new Date(this.time * 1000);
        const day = String(date.getDate()).padStart(2, '0');    // Заполнение нулями
        const month = String(date.getMonth() + 1).padStart(2, '0'); // Заполнение нулями
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');    // Заполнение нулями
        const minutes = String(date.getMinutes()).padStart(2, '0'); // Заполнение нулями
        const seconds = String(date.getSeconds()).padStart(2, '0'); // Заполнение нулями

        const formattedDate = `${year}-${month}-${day}${fulltime ? ` ${hours}:${minutes}:${seconds}` : ''}`;
        
        return formattedDate; 
    }

    addTime(shortUnix){

        //проверка корректности
        if(typeof shortUnix !== 'number') {
            throw new Error(`Некорретное время: '${shortUnix}'. Укажите Unix-время в миллисекундах`);
        }

        return new this.constructor(this.time + shortUnix); 
    }

    shortUnix(){
        return this.time;
    }
}

module.exports = Time