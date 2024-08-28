const QRCode = require('qrcode');
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;

//пользовательские модули
const {TextDayFormat, Buttons, FormatBytes,
WriteInLogFile, STATE} = require('./modules/Other');
const checkConfigFields = require('./modules/Data');
const APIserver = require('./modules/APIserver');

//конфигурация
let config = require('./config.json');

//основная настройка
const app = express();
app.use(express.json());

//основная конфигурация
const PORT = process.env.PORT || 4040;
const ADMIN_TELEGRAN_ID = Number(process.env.ADMIN_TELEGRAN_ID);
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

//создаем бота
const bot = new TelegramBot(TOKEN, { polling: true });

//хранилище состояний пользователей
let userStates = [];

String.prototype.format = function () {
    return this.replace(/ {2,}/g, ' ').replace(/((?=\n)\s+)|\n/g, '').replace(/\/n/g, '\n');
}

//оповещение основных событий
app.post('/notify' , (req, res) => {
    const {users} = req.body;

    try{
        //рассылка для каждого пользователя
        users.forEach(user => {
            const {id, message, control, withOptions} = user;
            
            //проверка данных
            if(!id || !message) throw new Error('');

            //управление заявками для администратора
            if(control){

                //управление входящими заявками
                if(control.action === 'accept offer'){

                    const adminState = userStates.find(state => state.telegramId === ADMIN_TELEGRAN_ID);
                    if(!adminState) return;
    
                    //оповещение о принятии или отклонении заявки
                    const options = Buttons([[
                        { text: '✅ Принять', callback_data: 'accept offer' },
                        { text: '❌ Отклонить', callback_data: 'reject offer' },
                    ]])

                    //установка действия для администратора
                    adminState.action = 'accept offer';

                    adminState.data = {
                        offerToAccept: control.offer_id
                    }

                    bot.sendMessage(id, message.format(), options);
                    return
                }
            }

            //использование опций
            const options = withOptions ? userStates.find(state => state.telegramId === id).options : undefined;

            //отправка сообщения пользователю
            bot.sendMessage(id, message.format(), options);
        });

        res.status(200).send('ok');

    }
    catch(err){
        WriteInLogFile(err);
        res.status(400).send('Невозможно обработать запрос');
    }
});

//изменение конфигурации
app.post('/config', async (req, res) => {
    try {
        //проверка корректности полей конфигурации
        checkConfigFields(req.body);
        
        await fs.writeFile('./config.json', JSON.stringify(req.body, null, 2));

        //изменение конфигурации сервера
        config = req.body;
        res.status(200).send('ok');
    }
    catch(err){

        //ошибка вызванная проверкой check
        if(err.dataCheck){
            return res.status(417, err.message).send();;
        }

        WriteInLogFile(err);

        // Ппроверяем, если ошибка возникла при проверке конфигурации
        if (err.message) {
            res.status(417).send(err.message);
        }
        else {
            res.status(500).send('Невозможно обновить конфигурацию');
        }
    }
});

//отправка конфигурации
app.get('/config', (req, res) => {
    res.status(200).json(config)
});

//завершение работы сервера
app.post('/stop', (req, res) => {

    //остановка бот-сервиса
    bot.stopPolling();
    res.status(200).send('ok');

    //закрытие сервера
    server.close(() => {
        WriteInLogFile('Server stopped');
        process.exit(0);
    });
})

//очистка логов 
app.post('/logs', async (req, res) => {
    try {
        await fs.writeFile('logs.txt', ''); // Очищаем файл логов
        res.status(200).send('ok');
    }
    catch (err) {
        WriteInLogFile(err);
        res.status(500).send('Невозможно почистить файл логов');
    }
});

//отправка логов
app.get('/logs', async (req, res) => {
    try{
        const logs = await fs.readFile('logs.txt', 'utf-8');
        res.status(200).send(logs);
    }
    catch(err){
        WriteInLogFile(err);
        res.status(500).send('Невозможно отправить данные');
    }
});

//запуск сервера
const server = app.listen(PORT, () => {
    console.clear();
    WriteInLogFile(`Сервер запущен на порту ${PORT} 👂`);
});

//отправляем кнопки при команде /start
bot.onText(/\/start/, async (msg) => {

    //идентификатор пользователя
    const telegramId = msg.from.id;

    //поиск инициализации диалога
    const state = userStates.find(item => item.telegramId === telegramId);

    if(state) return;

    //приветственное сообщение для администратора
    if(msg.from.id === ADMIN_TELEGRAN_ID){
        bot.sendMessage(telegramId, `Администратор распознан. Вы будете получать уведомления о новых пользователях, 
        заявках и прочую информацию`.format());
    }

    let userData = null;

    try{
        //поиск пользователя
        userData = await APIserver.FIND_USER(telegramId);

    }
    catch(err){

        if(err.response && typeof err.response.data === 'string'){
            bot.sendMessage(telegramId, err.response.data);
            return
        }

        WriteInLogFile(err);
        bot.sendMessage(telegramId, config.default_error_message);
        return;
    }

    //если пользователь найден
    if(userData){

        //новое сосотояние
        const options = mainMenuOptions();
        const userState = STATE({telegramId, data : {}, action: null, step: null, options, fullName: userData.full_name})

        //инициализация пустого сценария
        userStates.push(userState);
        bot.sendMessage(telegramId, `Рады вас видеть! ${userState.fullName} 🎉`, options);

    }
    //приветственное сообщение от сервера
    else {
        const serverConfig = await APIserver.GET_CONF();

        //опции для пользователя
        const options = Buttons([[
            { text: 'Попробовать бесплатно', callback_data: 'policy' },
            { text: 'Больше информации', callback_data: 'service info' }
        ]]);

        //новое сосотояние
        const userState = STATE({telegramId, data : {}, action: null, step: null, options})

        //инициализация пустого сценария
        userStates.push(userState)
        bot.sendMessage(telegramId, serverConfig.welcome_message, options);
    }
});
  
//обработка кликов по кнопкам
bot.on('callback_query', async (query) => {

    //телеграм пользователя
    const telegramId = query.from.id;
    
    //получаем индекс и состояние пользователя
    const state = userStates.find((item) => item.telegramId === telegramId);

    //не продолжать сценарий без начала диалога
    if(!state) return;

    try{

        //принятие новой заявки
        if(state.telegramId === ADMIN_TELEGRAN_ID && state.action === 'accept offer' && query.data === 'accept offer' ){
            await APIserver.ACCEPT_OFFER(state.data.offerToAccept);
            state.default();
        }

        //отклонение новой заявки
        if(state.telegramId === ADMIN_TELEGRAN_ID && state.action === 'accept offer' && query.data === 'reject offer' ){
            await APIserver.ACCEPT_OFFER(state.data.offerToAccept);
            state.default();
        }

        //подтверждение оплаты 
        if(query.data === 'confirm payment' && state.offerData){
            // поздравление с новой заявкой
            await bot.sendMessage(telegramId, `Ваша заявка отправлена 🎉/n/n
                Тип подписки: ${state.offerData.subname}/n
                Цена: ${state.offerData.price} ₽/n
                К оплате с учетом скидки: ${state.offerData.toPay} ₽/n
                Использованный промокод: ${state.offerData.promoName}/n
                Скидка по промокоду: ${state.offerData.discount}%/n/n
                Заявка уже обрабатывается 🕒/n
                Также статус заявки можно проверить в опции "Моя подписка"
            `.format(), state.options);
            return
        }

        //обработка на главную в случае отмены оплаты
        if(query.data === 'main menu' && state.fullName){
            bot.sendMessage(telegramId, 'Вы на главной странице своего аккаунта ℹ️', state.options);
            return
        }

        //контакты администратора
        if(query.data === 'admin info' && state.fullName){
            bot.sendMessage(telegramId, config.admin_contacts, state.options);
            return
        }

        //инструкция по подключению
        if(query.data === 'instruction' && state.fullName){
            bot.sendMessage(telegramId, config.service_instruction, state.options);
            return;
        }

        //обновление qrcode подключения
        if(query.data === 'update qrcode' && state.fullName){
            await APIserver.UPDATE_QRCODE(telegramId);
            bot.sendMessage(telegramId, 'QR-код обновлен 🔄️\nВыберите опцию \'Моя подписка\', чтобы просмотреть.', state.options);
            return
        }

        //информация по заявке
        if(query.data === 'offer info' && state.fullName){

            //получение информации о заявке
            const offerInfo = await APIserver.GET_OFFER_INFO(telegramId);

            //проверка на строку подключения
            if(!offerInfo.connString){
                bot.sendMessage(telegramId, `Ваша заявка обрабатывается 🕒/n/n
                    Название подписки: ${offerInfo.subName}/n
                    Трафик: ${!offerInfo.subDataGBLimit  ? 'ထ' : offerInfo.subDataGBLimit} ГБ / Мес/n
                    Срок подписки: ${TextDayFormat(offerInfo.subDateLimit / 86400)}/n/n
                    Вы также получите уведомление после обработки заявки ℹ️
                `.format(), state.options);
                return
            }

            // Генерация QR-кода
            const qrCodeBuffer = await QRCode.toBuffer(offerInfo.connString, { type: 'png' });

            //отправка сообщения с данными
            await bot.sendPhoto(telegramId, qrCodeBuffer, { caption: `QR-код для подключения по вашей подписке/n/n
                Это очень важно❗ Во избежание бессрочной блокировки, 
                не делитесь своим QR-кодом подключения ни с кем, подключайте только свои личные устройства./n/n
                ℹ️ Название подписки: ${offerInfo.subName}/n/n
                📶 Трафик: ${!offerInfo.subDataGBLimit  ? 'ထ' : offerInfo.subDataGBLimit} ГБ/n/n
                ℹ️ Использовано: ${FormatBytes(offerInfo.usedTraffic)}/n/n
                📅 Дата окончания: ${offerInfo.subDateLimit}/n/n
                ℹ️ Создан: ${offerInfo.createdDate}/n/n
                ${offerInfo.price === 0 ? '' : `👥 Код для приглашения друзей: ${offerInfo.inviteCode}/n/n`}
                Друг, который воспользуется вашим кодом приглашения при оформлении заявки, получит 10% скидку на оплату./n
                За каждого приглашенного друга по вашему коду, вы получаете скидку 25% на следующую оплату./n/n
                Скидка за приглашения накапливается❗/nМаксимальная скидка 💯
            `.format(), ...state.options});
            return
        }

        //политики сервиса
        if(query.data === 'policy' && !state.fullName){

            const options = Buttons([
                [{ text: 'Политика конфиденциальности 🔒 ', callback_data: 'private policy' }],
                [{ text: 'Пользовательское соглашение 👤', callback_data: 'user policy' }],
                [{ text: 'Согласен 💯, продолжим!', callback_data: 'registration' }]
            ])

            state.options = options;
            bot.sendMessage(telegramId, `Прежде чем приступить внимательно ознакомтесь с условиями нашего сервиса./n/n
            У нас прозрачные условия и политика конфиденциальности⚡`.format(), options);
            return
        }

        //политика конфеденциальности
        if(query.data ==='private policy' && !state.fullName){
            bot.sendMessage(telegramId, config.private_policy, state.options);
            return
        }

        //пользовательское соглашение
        if(query.data === 'user policy' && !state.fullName){
            bot.sendMessage(telegramId, config.user_policy, state.options);
            return
        }

        //оформление нового заказа
        if(query.data === 'registration' && !state.fullName){

            //проверка на наличие имени пользователя в телеграм
            if(!query.from.username){
                bot.sendMessage(telegramId, `Похоже, что вы не указали имя в телеграм при регистрации ℹ️/n/n
                    Ваше имя будет использоваться для удобства связи с вами в случае необходимости. 
                    Откройте настройки, и укажите его в графе "Имя пользователя", чтобы продолжить./n/n
                    ⚙️ Настройки ➡️ Имя пользователя
                `.format());

                return
            }

            //получение полей пользователя
            bot.sendMessage(telegramId, `Перед оформлением заявки зарегестрируйтесь в два клика!/n/n
            Будьте внимательны при заполнении ❗/n/n
            Введите фамилию имя и отчество (при наличии)`.format());
            
            // Устанавливаем состояние пользователя на 'ожидание имени'
            state.action = 'new user';
            state.step = 'awaiting_name';
            state.data = {};
            return
        }

        //если пользователь отказался от промокода
        if(query.data === 'no promocode' && state.fullName){
            await createNewoffer(state);
            state.default();
            return
        }

        //обработка выбранной подписки
        if(query.data.includes('sub=') && state.fullName){

            //проверка возможности использования промокода
            const currentSub = state.subData.find(item => item.name_id === query.data.replace('sub=', ''));

            //получение название подписки
            state.data = {
                'sub_id': query.data.replace('sub=', ''),
                'user_id': telegramId
            }

            //ограничим доступ к промокодам первым платным заказом
            const notFreeOffer = await APIserver.FIND_NOT_FREE_OFFER(state.telegramId);

            //если текущая подписка не поддерживает промокод
            if(!currentSub.with_promo || notFreeOffer){

                if(!currentSub.with_promo){
                    bot.sendMessage(telegramId, 'Эта подписка не поддерживает промокоды ℹ️');
                }
                else{
                    bot.sendMessage(telegramId, `Промокод доступен только при первой оплате ℹ️/n/n
                    Чтобы получить больше скидок, пригласите друга по своему личному промокоду. 
                    За каждого приглашенного друга, вы получаете скидку 25% на следующую оплату.
                    `.format());
                }
               
                await createNewoffer(state);
                state.default();
                return
            }
            //если промокод поддерживается
            else{

                //получение промокода
                state.action = 'awaiting promocode';

                //отказ от промокода
                state.options = Buttons(
                    [[{text: 'Продолжить без промокода ❓', callback_data: 'no promocode'}]]
                );

                //ввод промокода
                bot.sendMessage(telegramId, `Хотите больше сэконосить ?/n/n
                    Введите промокод, либо код приглашения от другого пользователя, чтобы получить скидку на оплату ℹ️
                `.format(), state.options);
                return
            }
        }

        //если новый заказ
        if(query.data === 'new offer' && (state.fullName || state.data.email)){

            //регистрация пользователя РЕШИТЬ
            if(!state.fullName){

                //получение дополнительных полей сведений о пользователе
                state.data.telegram = query.from.username;
                state.data.telegram_id = telegramId;

                //регистрация пользователя
                await APIserver.NEW_USER(state.data);

                //новые опции пользователя
                const options = mainMenuOptions();

                //обновляем сосотояние
                state.update({telegramId, options, data : {}, action: null, step: null, fullName: state.data.full_name});
            }

            //получение имеющиъся подписок
            state.subData = await APIserver.GET_SUBS();

            //установка имеющихся подписок
            state.options = Buttons(state.subData.map(sub => ([{ text: `
                ${sub.title} | 
                ${TextDayFormat(sub.date_limit / 86400)} | 
                Трафик ${sub.data_limit === 0 ? 'ထ' : sub.data_limit} Гб / Мес | 
                ${sub.price} ₽ / Мес/n
            `.format(), callback_data: `sub=${sub.name_id}`}])));

            //более развернутое сообщение о подписках
            bot.sendMessage(telegramId, `Выберите подписку 👇/n/n`.format(), state.options);
            return
        }
        
        //предоставление информации о сервисе и его работе
        if(query.data === 'service info' && !state.fullName){
            bot.sendMessage(telegramId, config.abaout_service, state.options);
            return
        }
    }
    catch(err){

        //сброс сосотояния
        state.default();

        //обработка ошибок axios
        if(err.response && typeof err.response.data === 'string'){
            bot.sendMessage(telegramId, err.response.data, state.options);
            return;
        }

        WriteInLogFile(err);
        bot.sendMessage(telegramId, config.default_error_message);
    }
});

//обработка соощений от пользователя
bot.on('message', async (msg) => {

    //идентификатор пользователя
    const telegramId = msg.from.id;
    const state = userStates.find(item => item.telegramId === telegramId);
    
    //проверка на начатый диалог
    if(!state){
        bot.sendMessage(telegramId, 'Выполните команду /start, чтобы начать.');
        return
    };

    try{
        //регистрация пользователя
        if(state.action === 'new user'){
            newUserAction(state, msg.text);
            return
        }
        
        //ввод промокода пользователем
        if(state.action === 'awaiting promocode'){

            //проверка на длинну промокода
            if(msg.text.length > 10) {
                bot.sendMessage(telegramId, 'Введенный промокод слишком длинный 🔂', state.options);
                return
            }

            state.data.promo_id = msg.text;
            await createNewoffer(state);
            state.default();
            return
        }

        //сообщение по умолчанию
        bot.sendMessage(telegramId, '❓Команда не распознана.', state.options);
    }
    catch(err){
        //обработка ошибок axios
        if(err.response && typeof err.response.data === 'string'){

            //проверка промокода
            if(state.action === 'awaiting promocode' && err.response.data.startsWith('Промокод')){
                bot.sendMessage(telegramId, err.response.data + ' 🔂', state.options);
                return
            }
        
            state.default();
            bot.sendMessage(telegramId, err.response.data, state.options);
            return;
        }

        //сброс сосотояния
        state.default();

        WriteInLogFile(err);
        bot.sendMessage(telegramId, config.default_error_message);
    }
});

//функция обработки нового пользователя
function newUserAction(state, messageText){
    //получение имени пользователя
    if(state.step === 'awaiting_name'){

        //ограничение данных ввода
        if(messageText.length > 100) {
            bot.sendMessage(state.telegramId, 'Поле \'ФИО\' имеет недопустимую длину 🔂');
            return
        }

        state.data.full_name = messageText;
        state.step = 'awaiting_education';
        bot.sendMessage(state.telegramId, `Вы обучаетесь ?/n
            Укажите учебную степень, например:/n/n
            Студент · Школьник · Не учусь · Другое (Укажите)/n/n
            Это не повлияет на решение по вашей заявке. ✔️
        `.format());
        return
    }

    //получение учебной степени
    if(state.step === 'awaiting_education'){
        //ограничение данных ввода
        if(messageText.length > 50 ){
            bot.sendMessage(state.telegramId, 'Поле \'Учебная степень\' имеет недопустимую длину 🔂');
            return
        }

        state.data.education_status = messageText;
        state.step = 'awaiting_phone';
        bot.sendMessage(state.telegramId, `Укажите личный номер телефона для связи с вами./n
        К примеру: 8 900 000 00 00`.format());
        return
    }

    //получение email
    if(state.step === 'awaiting_phone'){
        //ограничение данных ввода
        if(messageText.length > 15){
            bot.sendMessage(state.telegramId, 'Поле \'Номер телефона\' имеет недопустимую длину 🔂');
            return
        }

        //проверка на корректность номера телефона
        if(!Number(messageText.replace(/\s/g, ''))){
            bot.sendMessage(state.telegramId, `Номер телефона имеет неверный формат./n
            Пример заполнения: 8 900 000 00 00`.format());
            return
        }

        state.data.phone_number = Number(messageText.replace(/\s/g, ''));
        state.step = 'awaiting_email';
        bot.sendMessage(state.telegramId, 'Укажите свой email./nК примеру: RyanGosling@exmaple.com'.format());
        return
    }

    //получения остальных полей
    if(state.step === 'awaiting_email'){
        //ограничение данных ввода
        if(messageText.length > 100){
            bot.sendMessage(state.telegramId, 'Поле \'Email\' имеет недопустимую длину 🔂');
            return
        }

        //проверка на корректность email
        if(!messageText.includes('@')){
            bot.sendMessage(state.telegramId, `Email имеет неверный формат./n
            Пример заполнения: RyanGosling@exmaple.com`.format());
            return
        }

        state.data.email = messageText;
        state.step = 'check new user';
    }

    //проверка данный пользователем
    state.options = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: 'Исправить', callback_data: 'registration' },
                    { text: 'Все верно', callback_data: 'new offer' }
                ]
            ]
        }
    };

    //сообщение статуса регистрации
    bot.sendMessage(state.telegramId, `Проверьте правильность заполнения данных 👇/n/n
        👤 ФИО: ${state.data.full_name}/n/n
        🎓 Учебная степень: ${state.data.education_status}/n/n
        📲 Номер телефона: ${state.data.phone_number}/n/n
        📧 Email: ${state.data.email}/n/n
    `.format(), state.options);
}

//главное меню пользователя
function mainMenuOptions(){
    //тут обработка зарегестрированного пользователя
    const options = Buttons([
        [{ text: 'Моя подписка 📶', callback_data: 'offer info' }],
        [{ text: 'Обновить QR-код подключения 🔄️', callback_data: 'update qrcode' }],
        [{ text: 'Новая заявка 🆕', callback_data: 'new offer' }],
        [{ text: 'Как подключится ℹ️', callback_data: 'instruction' }],
        [{ text: 'Контакты администратора 👤', callback_data: 'admin info' }]
    ]);

    return options
}

//создание новой заявкиэ
async function createNewoffer(state){

    //получение id пользователя
    const telegramId = state.telegramId;

    try{
        //попытка отправки заявки с веденным промокодом
        state.offerData = await APIserver.CREATE_OFFER(state.data);

        //если оформление заказа вернуло код подключения сразу
        if(state.offerData.connection){

            // Генерация QR-кода
            const qrCodeBuffer = await QRCode.toBuffer(state.offerData.connection, { type: 'png' });

            // Получение информации по подписке
            const offerInfo = await APIserver.GET_OFFER_INFO(telegramId);

            //сброс опций
            state.default();

            //отправка сообщения с данными
            await bot.sendPhoto(telegramId, qrCodeBuffer, { caption: `QR-код для подключения по вашей подписке/n/n
                Это очень важно❗ Во избежание бессрочной блокировки, 
                не делитесь своим QR-кодом подключения ни с кем, подключайте только свои личные устройства./n/n
                ℹ️ Название подписки: ${offerInfo.subName}/n/n
                📶 Трафик: ${!offerInfo.subDataGBLimit  ? 'ထ' : offerInfo.subDataGBLimit} ГБ/n/n
                ℹ️ Использовано: ${FormatBytes(offerInfo.usedTraffic)}/n/n
                📅 Дата окончания: ${offerInfo.subDateLimit}/n/n
                ℹ️ Создан: ${offerInfo.createdDate}/n/n
                При приобритении платной подписки вам доступен личный промокод. 
                За каждого приглашенного друга по вашему промокоду, вы получаете скидку 25% на следующую оплату./n/n
                Скидка за приглашения накапливается❗/nМаксимальная скидка 💯
            `.format(), ...state.options});

            return
        }

        // чтение файла картинки оплаты
        const imgPath = path.join(__dirname, 'payments', 'payqrcode.jpg');
        const imgBuffer = await fs.readFile(imgPath);

        //пустые кнопки для подтверждения
        state.options = Buttons([
            [{ text: 'Готово 👌', callback_data: 'confirm payment' }],
            [{ text: 'Вернуться 🔙', callback_data: 'main menu' }],
        ]);

        // отправка изображения с текстом
        await bot.sendPhoto(telegramId, imgBuffer, {
            caption: `К оплате: ${state.offerData.toPay} ₽/n
            Скидка по промокоду ${state.offerData.promoName} — ${state.offerData.discount}% ℹ️/n/n
            Сканируйте QR-код для оплаты, если используете приложение Сбербанк/n/n
            Или воспользуйтесь безкомпромиссной оплатой по СПБ на номер: +7 922 406 56 25. Получатель Альберт К./n/n
            Это очень важно ❗ Отправьте чек на почту: wildcat2k21@gmail.com/n/n
            Желательно сохраните копию чека у себя.
            `.format(), ...state.options
        });
    
    //обрабатывает только ошибку использования пробной подписки
    }
    catch(err){

        //проверка на ошибку переоформления пробной подписки
        if(err.response && typeof err.response.data === 'string' && err.response.data.startsWith('Пробная подписка')){
            state.default();
            bot.sendMessage(telegramId, 'Пробная подписка доступна только на первый заказ 🔙', state.options);
            return
        }

        throw err;
    }
}