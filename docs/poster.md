webhooks: Вебхуки
Вебхуки позволяют моментально получать информацию об изменении объекта в Poster. Например, когда добавили новый товар в меню или пробили чек.

Подключение
Перейдите в свой аккаунт разработчика во вкладку Приложения → Poster for Developers и нажмите Ред. напротив вашей интеграции.
В блоке Вебхуки выберите сущности, по которым хотите получать хуки, и URL, на который отсылать хуки.
Подключите ваше приложение в аккаунте, по которому нужно получать хуки.
Отредактируйте, удалите или создайте сущность, чтобы выполнить отправку хука.
Например, для отправки хука по заказам подпишитесь на сущность transaction и закрыть заказ на терминале.

Параметры вебхука

Пример входящего вебхука:

{
  "account":"api-demo",
  "account_number":"813932",
  "object":"transaction",
  "object_id":1,
  "action":"added",
  "time":"1518794257",
  "verify":"a23sk3d9123ka31sd3k5asd9123sad93"
}
Copy to clipboardErrorCopied
Пример обработки вебхука:

<?php
// Секретный ключ вашего приложения
$client_secret = 'fe2bc8e865d8fc2236968ee53c3b2bd5';

// Приводим к нужному формату входящие данные
$postJSON = file_get_contents('php://input');
$postData = json_decode($postJSON, true);

$verify_original = $postData['verify'];
unset($postData['verify']);

$verify = [
    $postData['account'],
    $postData['object'],
    $postData['object_id'],
    $postData['action'],
];

// Если есть дополнительные параметры
if (isset($postData['data'])) {
    $verify[] = $postData['data'];
}
$verify[] = $postData['time'];
$verify[] = $client_secret;

// Создаём строку для верификации запроса клиентом
$verify = md5(implode(';', $verify));

// Проверяем валидность данных 
if ($verify != $verify_original) {
    exit;
}

// Если не ответить на запрос, Poster продолжит слать Webhook
echo json_encode(['status' => 'accept']);
Copy to clipboardErrorCopied
Все уведомления приходят POST запросом и содержат следующие параметры:

Параметр	Описание
account	Аккаунт клиента, который создал событие
account_number	Номер аккаунта, который создал событие
object	Сущность по которой поступил вебхук
object_id	Первичный ключ объекта
action	Действие выполненное над сущностью: added — добавлен, changed — измененен, removed — удален, transformed — трансформация (например, тех. карты в товар и наоборот)
time	Время отправки вебхука в Unix timestamp
verify	Подпись запроса, состоит из md5 от account, object, object_id, action, data (если передается) и secret соединенных через ;
data	Дополнительный параметр у некоторых сущностей
На полученный вебхук нужно отвечать 200 статусом по HTTP протоколу. Иначе мы будем считать вебхук не доставленным и попытаемся отправить его еще 15 раз в течение двух дней.
Заказы
Сущность	Описание
transaction	Заказы
incoming_order	Онлайн-заказы и бронирование
incoming_order: Состояние онлайн-заказа

Событие changed срабатывает при изменении статуса заказа с новый на принят или отклонен.

В теле хука приходит дополнительный параметр data, который содержит следующие параметры:

Параметр	Описание
type	Тип, принимает значение: 1 — онлайн заказ, 2 — бронирование
Меню
Сущность	Описание
product	Товары
dish	Тех. карты
category	Категории товаров и тех. карт
prepack	Полуфабрикаты
ingredient	Ингредиенты
workshop	Цеха
ingredients_category	Категории ингридиентов
Маркетинг
Сущность	Описание
client	Клиенты
client_payed_sum	Закрытие заказа с привязаным клиентом
clients_group	Группы клиентов
promotion	Акции
promotion_prize	Накоплени акции
client_ewallet	Депозиты клиента
loyalty rule	Правила перехода между группами клиентов
client_ewallet

В теле хука приходит дополнительный параметр data который содержит следующие параметры:

Параметр	Описание
value_relative	Дельта изменения суммы на депозитном счету
value_absolute	Итоговая сумма на депозитном счету
Склад
Сущность	Описание
storage	Склады
stock	Состояние товара или ингрединта на складе
supply	Поставки
stock

В теле хука приходит дополнительный параметр data который содержит следующие параметры:

Параметр	Описание
type	Тип, принимает значение: 1 — ингредиент, 2 — товар, 3 — модификатор, 4 — производимая тех. карта, 5 — производимый полуфабрикат
element_id	Первичный ключ объекта
storage_id	Первичный ключ объекта склада
value_relative	Изменение количества позиции на складе
value_absolute	Конечное значение количества позиции на складе
Финансы
Сущность	Описание
book_transaction	Финансовые транзакции
cash_shift_transaction	Кассовые транзакции
Доступ
Сущность	Описание
spot	Заведения
register	Касса
waiter	Официант
Настройки и приложения
Сущность	Описание
configs	Настройки
application	Установка или удаление приложения
application

В теле хука приходит дополнительный параметр data который содержит следующие параметры:

Параметр	Описание
user_id	Id сотрудника, который установил приложение
access_token	Токен доступа для работы с API. Возврашается в случае, если action — added.
Не приходят вебхуки?

Отвечает ли URL, который указали в URL for webhooks, статусу с кодом 200 и принимает POST?

При проверке в Poster for Developments, появляется ли зеленая галочка?

Подписаны ли вы на события, сущности которых меняете?

Попробуйте сымитировать отправку хука. Для этого отредактируйте в Poster сущность, по которой ждете хук.

Проверьте, подключено ли ваше приложение к аккаунту, от которого ждете хуки.

Если не отвечали на предыдущие хуки 200 статусом, примите предыдущие и после этого начнут поступать новые.

Если нет возможности принять старые, то удалите все сущности из Receive webhooks by, сохраните и добавьте еще раз.

📝 Изменить документацию
Коды ошибок
Пример ответа:

{  
  "error":{  
    "code":11,
    "message":"Bad access token"
  }
}
Copy to clipboardErrorCopied
Web API в своих ответах возвращает такие ошибки:
Код ошибки	Описание
0	Успех
10	Не указан access_token
11	Неверный access_token
12	Истёк срок действия access_token
20	У приложения недостаточно прав для вызова данного метода
32	ID не существует
34	Пустое поле
36	Переменная должна быть массивом
37	Неправильный номер телефона
38	Такое название уже существует
42	Переменной не существует
44	Ошибка сохранения данных
45	Время действия меньше времени открытия чека
52	Диапазон дат должен быть не более 3-х дней
54	Доступ запрещен
99	Дублирование сущности
153	Вы не можете вносить изменения
154	Название модификатора должно быть уникальным
155	Неправильное значение параметра
168	Недопустимый статус заказа
169	Недопустимый тип заказа
400	Неверный формат запроса, отсутствуют необходимые данные
404	Запись не найдена
503	Аккаунт, в который делаете запрос, заархивирован
700	Ограничение по тарифу
701	Поле должно быть целым числом
4001	Неверная валюта
Методы раздела Чеки возвращают дополнительный ошибки:
Код ошибки	Описание
1	Ошибка сохранения в базу данных
41	Товар не найден
42	Модификация товара не найдена
42	Чек не найден
43	Товар в чеке не найден
44	Акция не найдена
45	Не получилось применить акцию
46	Кол-во товара меньше нуля
47	Акция не найдена
49	Клиент не найден
50	Не передали обязательное поле
60	Заведение не найдено
88	Сумма всех товаров в чеке и сумма оплаты не равны
185	Время доставки в прошлом
📝 Изменить документацию


📝 Изменить документацию

dash: Статистика

Методы для работы с разделом Статистика. Все методы данного раздела начинаются с «dash». Список доступных методов:

dash.getTransaction: Получить чек
dash.getTransactions: Получить все чеки
dash.getTransactionProducts: Получить товары в чеке
dash.getTransactionsProducts: Получить товары в нескольких чеках
dash.getTransactionHistory: Получить историю чека
dash.getTransactionWriteOffs: Получить списание по чеку
dash.getAnalytics: Получить статистику по продажам
dash.getProductsSales: Получить продажи по товарам
dash.getCategoriesSales: Получить продажи по категориям
dash.getClientsSales: Получить продажи по клиентам
dash.getWaitersSales: Получить продажи по официантам
dash.getSpotsSales: Получить продажи по заведениям
dash.getPaymentsReport: Получить статистику по дням/месяцам
📝 Изменить документацию

dash.getTransaction: Получить чек
Пример запроса
JS
javascript

const url = 'https://joinposter.com/api/dash.getTransaction
?token=687409:4164553abf6a031302898da7800b59fb
&transaction_id=330660
&include_history=true
&include_products=true
&include_delivery=true';
PHP
Postman
Пример ответа
json
{
   "response":[
      {
         "transaction_id":"330660",
         "date_start":"1518873040083",
         "date_start_new":"1518873041556",
         "date_close":"1518873046314",
         "status":"2",
         "guests_count":"2",
         "discount":"0",
         "bonus":"0",
         "pay_type":"3",
         "payed_bonus":"0",
         "payed_card":"0",
         "payed_cash":"2750",
         "payed_sum":"2750",
         "payed_cert":"0",
         "payed_third_party":"0",
         "round_sum":"0",
         "tip_sum":"0",
         "tips_card": "0",
         "tips_cash": "0",
         "sum":"2750",
         "spot_id":"1",
         "table_id":"94",
         "name":"Анна",
         "user_id":"1",
         "client_id":"0",
         "card_number":"0",
         "transaction_comment":null,
         "reason":"",
         "print_fiscal":"0",
         "total_profit":"-8786",
         "total_profit_netto":"-6789",
         "table_name":"5",
         "client_firstname":null,
         "client_lastname":null,
         "date_close_date":"2018-02-17 16:10:46",
         "service_mode": "1",
         "processing_status": "60",
         "client_phone": null,
         "delivery":{
            "payment_method_id":0,
            "delivery_zone_id":1,
            "bill_amount":0,
            "delivery_price":2000,
            "country":"Ukraine",
            "city":"Kyiv",
            "address1":"khreshchatyk 25",
            "address2":"",
            "comment":"",
            "lat":null,
            "lng":null,
            "zip_code":"",
            "delivery_time":"2018-02-17 16:00:00",
            "courier_id":10
         },
         "products":[
            {
               "product_id":"162",
               "modification_id":"0",
               "num":"1",
               "product_price":"1050",
               "payed_sum":"1050",
               "print_fiscal":"0",
               "tax_id":"0",
               "tax_value":"0",
               "tax_type":"0",
               "tax_fiscal":"0",
               "tax_sum":"0",
               "product_cost":"4536",
               "product_cost_netto":"3780",
               "product_profit":"-3486",
               "product_profit_netto":"-2905"
            },
            {
               "product_id":"161",
               "modification_id":"0",
               "num":"1",
               "product_price":"1700",
               "payed_sum":"1700",
               "print_fiscal":"0",
               "tax_id":"0",
               "tax_value":"0",
               "tax_type":"0",
               "tax_fiscal":"0",
               "tax_sum":"0",
               "product_cost":"7000",
               "product_cost_netto":"5833",
               "product_profit":"-5300",
               "product_profit_netto":"-3884"
            }
         ],
         "history":[
            {
               "history_id":"2485357",
               "type_history":"open",
               "spot_tablet_id":"1",
               "time":"1518873040083",
               "user_id":"1",
               "value":"1",
               "value2":"94",
               "value3":"2",
               "value4":"0",
               "value5":"0",
               "value_text":null
            },
            {
               "history_id":"2485358",
               "type_history":"additem",
               "spot_tablet_id":"1",
               "time":"1518873041556",
               "user_id":"1",
               "value":"162",
               "value2":"0",
               "value3":"0",
               "value4":"0",
               "value5":"0",
               "value_text":{
                  "price":10.5
               }
            },
            {
               "history_id":"2485359",
               "type_history":"additem",
               "spot_tablet_id":"1",
               "time":"1518873042008",
               "user_id":"1",
               "value":"161",
               "value2":"0",
               "value3":"0",
               "value4":"0",
               "value5":"0",
               "value_text":{
                  "price":17
               }
            },
            {
               "history_id":"2485360",
               "type_history":"close",
               "spot_tablet_id":"1",
               "time":"1518873046314",
               "user_id":"1",
               "value":"3",
               "value2":"2750",
               "value3":"0",
               "value4":"0",
               "value5":"0",
               "value_text":{
                  "payments":{
                     "cash":27.5
                  }
               }
            }
         ]
      }
   ]
}
Метод возвращает список с одним чеком.

HTTP запрос
GET https://joinposter.com/api/dash.getTransaction

GET-параметры запроса dash.getTransaction
Параметр	Описание
transaction_id	Обязательный параметр, номер чека по которому возвращать информацию.
include_products	Включить товары в транзакциях в ответ, true — включать, false — нет.
include_history	Включить историю транзакции в ответ, true — включать, false — нет.
include_delivery	Включить информацию по доставке в ответ, true — включать, false — нет.
timezone	Опциональный параметр, если равен client то дата возвращается в часовом поясе аккаунта.
type	Тип статистики: waiters — по официанту, spots — заведению, clients — клиенту. При использовании обязательно указать id.
id	ID сущности по которой получать статистику, если не указано будут выданы транзакции по всем типам статистики. При использовании обязательно указать type.
status	Статус заказа: 0 — все заказі, 1 — только открытые, 2 — только закрытые, 3 — удаленные.
Параметры ответа dash.getTransaction
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит массив объектов, внутри каждого есть следующие параметры:

Параметр	Описание
date_start	Дата открытия заказа в миллисекундах
date_close	Дата закрытия заказа в миллисекундах, 0 — если заказ еще открыт
status	Статус заказа: 1 — открыт, 2 — закрыт, 3 — удален, 4 - отменён (только для онлайн-заказов), 0 - ожидает подтверждения (только для онлайн-заказов)
guests_count	Количество гостей
name	Имя официанта
discount	Скидка в процентах
bonus	Начисленный бонус в процентах от payed_sum
pay_type	Тип оплаты: 0 — закрыт без оплаты (причина в reason), 1 — оплата наличкой, 2 — оплата карточкой, 3 — смешанная оплата
payed_bonus	Сумма уплаченная бонусами в копейках
payed_card	Сумма уплаченная картой в копейках
payed_cash	Сумма уплаченная наличкой в копейках
payed_third_party	Сумма уплаченная третьей стороной в копейках
payed_sum	Сумма уплаченная "живыми деньгами", равна сумме payed_cash плюс payed_card
round_sum	Сумма округления по чеку в копейках
tip_sum	Сумма процента за обслуживание в копейках
tips_card	Сумма чаевых уплаченная картой в копейках
tips_cash	Сумма чаевых уплаченная наличными в копейках
sum	Общая сумма заказа, без скидок в копейках
spot_id	ID заведения
table_id	ID столика
user_id	ID официанта
client_id	ID клиента
transaction_comment	Комментарий к чеку
reason	Причина закрытия счета без оплаты: 1 — гость ушел, 2 — за счет заведения, 3 — ошибка официанта
print_fiscal	Признак печати фискального чека: 0 — не печатали, 1 — печатали, 2 — фискальный возврат
total_profit	Сумма прибыли
total_profit_netto	Сумма прибыли без НДС. Возвращается если включена настройка «Считать себестоимость и прибыль нетто»
table_name	Название столика
client_firstname	Имя клиента
client_lastname	Фамилия клиента
service_mode	Тип заказа: 1 — в заведении, 2 — навынос, 3 — доставка
processing_status	Статус заказа: 10 — открыт, 20 — готовится, 30 — приготовлен, 40 — в пути, 50 — доставлен, 60 — закрыт, 70 — удалён
client_phone	Номер телефона клиента
delivery	Информация о доставке в чеке
products	Массив товаров в чеке
history	История действий над чеком. Содержит массив из объектов, описание параметров объекта смотрите в методе dash.getTransactionHistory.
Внутри параметра delivery лежит массив, внутри которого есть следующие параметры:

Параметр	Описание
payment_method_id	ID метода оплаты выбранного для оплаты заказа
delivery_zone_id	ID зоны доставки
bill_amount	Купюра которой клиент оплачивает заказ
delivery_price	Стоимость доставки
country	Страна доставки
city	Город доставки
address1	Адрес доставки. Улица и номер дома
address2	Адрес доставки. Подъезд, этаж, квартира и т. д.
comment	Комментарий к доставке
lat	Широта адреса доставки
lng	Долгота адреса доставки
zip_code	Индекс адреса доставки
delivery_time	Дата доставки
courier_id	ID курьера
Внутри параметра products лежит массив объект, внутри каждого есть следующие параметры:

Параметр	Описание
product_id	ID товара
modification_id	ID модификации
product_price	Стоимость товара
num	Количество товара в чеке
payed_sum	Уплаченная сумма
product_cost	Себестоимость товара в копейках
product_cost_netto	Себестоимость товара в копейках без НДС. Возвращается если включена настройка «Считать себестоимость и прибыль нетто»
product_profit	Прибыль по товару в копейках
product_profit_netto	Прибыль по товару в копейках без НДС. Возвращается если включена настройка «Считать себестоимость и прибыль нетто»
print_fiscal	Признак печати фискального чека: 0 — не печатали, 1 — печатали, 2 — фискальный возврат
tax_id	ID налога
tax_value	Процент налога
tax_type	Тип налога: 1 — налог с продаж, 2 — налог с оборота, 3 — НДС, 4 — без налога
tax_fiscal	Налог по фискальному регистратору
tax_sum	Сумма налога
📝 Изменить документацию

dash.getTransactions: Получить все чеки
Пример запроса
JS
javascript

const url = 'https://joinposter.com/api/dash.getTransactions
?token=687409:4164553abf6a031302898da7800b59fb
&dateFrom=20240905
&dateTo=20240908';
PHP
Postman
Пример ответа
json
{
  "response":[
    {
      "transaction_id":"384960",
      "date_start":"1504641602936",
      "date_start_new":"1504641602941",
      "date_close":"1504641603008",
      "status":"2",
      "guests_count":"4",
      "discount":"0",
      "bonus":"0",
      "pay_type":"3",
      "payed_bonus":"0",
      "payed_card":"0",
      "payed_cash":"199140",
      "payed_sum":"199140",
      "payed_cert":"0",
      "tip_sum":"0",
      "sum":"180600",
      "spot_id":"1",
      "table_id":"90",
      "name":"Demo",
      "user_id":"1",
      "client_id":"0",
      "card_number":"0",
      "transaction_comment":null,
      "reason":"",
      "print_fiscal":"0",
      "total_profit":"172828",
      "table_name":"1",
      "client_firstname":null,
      "client_lastname":null,
      "date_close_date":"2024-09-05 23:00:03"
    },
    {
      "transaction_id":"384956",
      "date_start":"1504641601797",
      "date_start_new":"1504641601809",
      "date_close":"1504641601850",
      "status":"2",
      "guests_count":"5",
      "discount":"0",
      "bonus":"0",
      "pay_type":"3",
      "payed_bonus":"0",
      "payed_card":"0",
      "payed_cash":"117000",
      "payed_sum":"117000",
      "payed_cert":"0",
      "tip_sum":"0",
      "sum":"117000",
      "spot_id":"1",
      "table_id":"91",
      "name":"Максим",
      "user_id":"2",
      "client_id":"0",
      "card_number":"0",
      "transaction_comment":null,
      "reason":"",
      "print_fiscal":"0",
      "total_profit":"113487",
      "table_name":"2",
      "client_firstname":null,
      "client_lastname":null,
      "date_close_date":"2024-09-05 23:00:02"
    }
  ]
}
Метод возвращает список транзакций.

HTTP GET запрос
GET https://joinposter.com/api/dash.getTransactions

GET-параметры запроса dash.getTransactions
Параметр	Описание
dateFrom	Опциональный параметр, дата начала выборки в формате Ymd, включительно. По умолчанию дата месяц назад.
dateTo	Опциональный параметр, дата конца выборки в формате Ymd, включительно. По умолчанию дата текущего дня.
type	Тип статистики: waiters — по официанту, spots — заведению, clients — клиенту. При использовании обязательно указать id.
id	ID сущности по которой получать статистику, если не указано будут выданы заказы по всем типам статистики. При использовании обязательно указать type.
status	Статус заказа: 0 — все заказы, 1 — только открытые, 2 — только закрытые, 3 — только удаленные.
include_products	Включить товары в транзакциях в ответ, true — включать, false — нет.
include_history	Включить историю транзакции в ответ, true — включать, false — нет.
include_delivery	Включить информацию о доставке в ответ, true — включать, false — нет.
service_mode	Тип заказа: 1 — в заведении, 2 — навынос, 3 — доставка.
courier_id	ID курьера по которому нужно получить заказы.
next_tr	ID заказа после которого нужно получить список заказов.
after_date_close	Заказы после даты закрытия в формате unixtimestamp.
before_date_close	Заказы до даты закрытия в формате unixtimestamp.
timezone	Опциональный параметры, если равен client то дата возвращается в часовом поясе аккаунта.
table_id	Опциональный параметры, предназначен для фильтрования результатов по id столика.
Параметры ответа dash.getTransactions
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит массив объектов, внутри каждого параметры:

Параметр	Описание
date_start	Дата открытия заказа в миллисекундах
date_close	Дата закрытия заказа в миллисекундах, 0 — если заказ еще открыт
status	Статус заказа: 1 — открыт, 2 — закрыт, 3 — удален
guests_count	Количество гостей
name	Имя официанта
discount	Скидка в процентах
bonus	Процент начисления бонусов для клиента
pay_type	Тип оплаты: 0 — закрыт без оплаты (причина в reason), 1 — оплата наличкой, 2 — оплата карточкой, 3 — смешанная оплата
payed_bonus	Сумма уплаченная бонусами в копейках
payed_card	Сумма уплаченная картой в копейках
payed_cash	Сумма уплаченная наличкой в копейках
payed_third_party	Сумма уплаченная третьей стороной в копейках
payed_sum	Сумма уплаченная "живыми деньгами", равна сумме payed_cash плюс payed_card
round_sum	Сумма округления по чеку в копейках
sum	Общая сумма заказа, без скидок в копейках
spot_id	ID заведения
table_id	ID столика
user_id	ID официанта
client_id	ID клиента
transaction_comment	Комментарий к чеку
reason	Причина закрытия счета без оплаты: 1 — гость ушел, 2 — за счет заведения, 3 — ошибка официанта
print_fiscal	Признак печати фискального чека: 0 — не печатали, 1 — печатали, 2 — фискальный возврат
total_profit	Сумма прибыли
total_profit_netto	Сумма прибыли без НДС. Возвращается если включена настройка «Считать себестоимость и прибыль нетто»
table_name	Название столика
client_firstname	Имя клиента
client_lastname	Фамилия клиента
service_mode	Тип заказа: 1 — в заведении, 2 — навынос, 3 — доставка
processing_status	Статус заказа: 10 — открыт, 20 — готовится, 30 — приготовлен, 40 — в пути, 50 — доставлен, 60 — закрыт, 70 — удалён
client_phone	Номер телефона клиента
delivery	Информация о доставке в чеке
products	Массив товаров в чеке
history	История действий над чеком. Содержит массив из объектов, описание параметров объекта смотрите в методе dash.getTransactionHistory.
Внутри параметра delivery лежит массив, внутри которого параметры:

Параметр	Описание
payment_method_id	ID метода оплаты выбранного для оплаты заказа
delivery_zone_id	ID зоны доставки
bill_amount	Купюра которой клиент оплачивает заказ
delivery_price	Стоимость доставки
country	Страна доставки
city	Город доставки
address1	Адрес доставки. Улица и номер дома
address2	Адрес доставки. Подъезд, этаж, квартира и т. д.
comment	Комментарий к доставке
lat	Широта адреса доставки
lng	Долгота адреса доставки
zip_code	Индекс адреса доставки
delivery_time	Дата доставки
courier_id	ID курьера
Внутри параметра products лежит массив объект, внутри каждого параметры:

Параметр	Описание
product_id	ID товара
modification_id	ID модификации
product_price	Стоимость товара
num	Количество товара в чеке
payed_sum	Уплаченная сумма
product_cost	Себестоимость товара в копейках
product_cost_netto	Себестоимость товара в копейках без НДС. Возвращается если включена настройка «Считать себестоимость и прибыль нетто»
product_profit	Прибыль по товару в копейках
product_profit_netto	Прибыль по товару в копейках без НДС. Возвращается если включена настройка «Считать себестоимость и прибыль нетто»
print_fiscal	Признак печати фискального чека: 0 — не печатали, 1 — печатали, 2 — фискальный возврат
tax_id	ID налога
tax_value	Процент налога
tax_type	Тип налога: 1 — налог с продаж, 2 — налог с оборота, 3 — НДС, 4 — без налога
tax_fiscal	Налог по фискальному регистратору
tax_sum	Сумма налога
📝 Изменить документацию

dash.getTransactionProducts: Получить товары в чеке
Пример запроса
JS
javascript

const url = 'https://joinposter.com/api/dash.getTransactionProducts
?token=687409:4164553abf6a031302898da7800b59fb
&transaction_id=388678';
PHP
Postman
Пример ответа
json
{
  "response":[
    {
      "product_id":"908",
      "product_name":"Пицца сборная",
      "modification_id":"68",
      "modificator_name":"Сыр, Грибы, Ох. колбаски, Оливки, Средняя Ø35см",
      "modificator_barcode":"",
      "modificator_product_code":"",
      "weight_flag":"0",
      "num":"1",
      "time":"1507703516999",
      "workshop":"2",
      "barcode":"",
      "product_code":"",
      "tax_id":"4",
      "nodiscount":"1",
      "payed_sum":"45000",
      "product_sum":"45000",
      "discount":"0",
      "bonus_sum":"0",
      "round_sum":0,
      "client_id":"0",
      "promotion_id":"0",
      "cert_sum":"0",
      "product_cost":"43",
      "product_cost_netto":"36",
      "product_profit":"42707",
      "product_profit_netto":"42700",
      "bonus_accrual":"0",
      "tax_value":"5",
      "tax_type":"2",
      "tax_fiscal":"1",
      "category_id":"33"
    },
    {
      "product_id":"169",
      "product_name":"Речная форель в фольге",
      "modification_id":"0",
      "modificator_name":null,
      "modificator_barcode":null,
      "modificator_product_code":null,
      "weight_flag":"0",
      "num":"1",
      "time":"1507703509384",
      "workshop":"2",
      "barcode":"",
      "product_code":"",
      "tax_id":"4",
      "nodiscount":"1",
      "payed_sum":"55000",
      "product_sum":"55000",
      "discount":"0",
      "bonus_sum":"0",
      "round_sum":0,
      "client_id":"0",
      "promotion_id":"0",
      "cert_sum":"0",
      "product_cost":"4340",
      "product_cost_netto":"3617",
      "product_profit":"47910",
      "product_profit_netto":"47187",
      "bonus_accrual":"0",
      "tax_value":"5",
      "tax_type":"2",
      "tax_fiscal":"1",
      "category_id":"33"
    },
    {
      "product_id":"168",
      "product_name":"Стейк из сёмги",
      "modification_id":"0",
      "modificator_name":null,
      "modificator_barcode":null,
      "modificator_product_code":null,
      "weight_flag":"0",
      "num":"1",
      "time":"1507703508927",
      "workshop":"2",
      "barcode":"",
      "product_code":"",
      "tax_id":"4",
      "nodiscount":"1",
      "payed_sum":"45000",
      "product_sum":"45000",
      "discount":"0",
      "bonus_sum":"0",
      "round_sum":0,
      "client_id":"0",
      "promotion_id":"0",
      "cert_sum":"0",
      "product_cost":"2213",
      "product_cost_netto":"1844",
      "product_profit":"40537",
      "product_profit_netto":"40168",
      "bonus_accrual":"0",
      "tax_value":"5",
      "tax_type":"2",
      "tax_fiscal":"1",
      "category_id":"33"
    }
  ]
}
Метод возвращает список продуктов по транзакции.

HTTP GET запрос
GET https://joinposter.com/api/dash.getTransactionProducts

GET-параметры запроса dash.getTransactionProducts
Параметр	Описание
transaction_id	Обязательный параметр, ID заказа (номер чека)
Параметры ответа dash.getTransactionProducts
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит объект, внутри которого есть следующие параметры:

Параметр	Описание
product_id	ID товара
product_name	Название товара
modification_id	ID модификатора. Если без модификатора то 0.
modificator_name	Название модификатора
modificator_barcode	Штрих-код модификатора
modificator_product_code	SKU модификатора
num	Количество товара в чеке
time	Время последнего обновления количества товара в чеке, измеряется в миллисекундах
workshop	ID цеха
barcode	Штрих-код товара
product_code	SKU товара
tax_id	ID налога
fiscal	Признак фискального чека: 1 — фискальный, 0 — нефискальный
nodiscount	Признак распространяются ли скидки и бонусы на товар: 0 — да, 1 — нет
payed_sum	Уплаченная сумма
product_sum	Стоимость товара
discount	Процент скидки примененный к чеку
bonus_sum	Сумма бонуса
client_id	ID клиента
promotion_id	ID акции
cert_sum	Сумма уплаченная сертификатом
product_cost	Себестоимость товара
product_cost_netto	Себестоимость товара без НДС. Возвращается если включена настройка «Считать себестоимость и прибыль нетто»
product_profit	Прибыль
product_profit_netto	Прибыль без НДС. Возвращается если включена настройка «Считать себестоимость и прибыль нетто»
bonus_accrual	Начислено бонусов
round_sum	Сумма округления по товару в копейках
tax_value	Процент налога от суммы чека
tax_type	Тип налога: 1 — налог с продаж, 2 — налог с оборота, 3 — НДС, 4 — без налога
tax_fiscal	Налог по фискальному регистратору
category_id	ID категории в которой содержится товар
📝 Изменить документацию

 Previous
Получить все чеки
Next 
Получить товары в нескольких чеках
dash.getTransactionsProducts: Получить товары в нескольких чеках
Пример запроса
JS
javascript

const url = 'https://joinposter.com/api/dash.getTransactionsProducts
?token=687409:4164553abf6a031302898da7800b59fb
&transactions_id=1,2';
PHP
Postman
Пример ответа
json
{
   "response":[
      {
         "transaction_id":1,
         "product_id":169,
         "product_name":"Речная форель",
         "modification_id":0,
         "modificator_name":null,
         "modificator_barcode":null,
         "modificator_product_code":null,
         "weight_flag":0,
         "num":2,
         "time":1527148991899,
         "workshop":2,
         "barcode":"",
         "product_code":"",
         "tax_id":0,
         "nodiscount":0,
         "payed_sum":"252.00",
         "product_sum":"252.00",
         "discount":0,
         "bonus_sum":"0.00",
         "client_id":0,
         "promotion_id":"0",
         "cert_sum":"0.00",
         "product_cost":0,
         "product_cost_netto":0,
         "product_profit":25200,
         "product_profit_netto":25200,
         "bonus_accrual":0,
         "tax_value":0,
         "tax_type":0,
         "tax_fiscal":0,
         "category_id":33
      },
      {
         "transaction_id":2,
         "product_id":168,
         "product_name":"Стейк из семги",
         "modification_id":0,
         "modificator_name":null,
         "modificator_barcode":null,
         "modificator_product_code":null,
         "weight_flag":0,
         "num":2,
         "time":1527149138470,
         "workshop":2,
         "barcode":"",
         "product_code":"",
         "tax_id":0,
         "nodiscount":1,
         "payed_sum":"0.00",
         "product_sum":"360.00",
         "discount":0,
         "bonus_sum":"0.00",
         "client_id":0,
         "promotion_id":"0",
         "cert_sum":"0.00",
         "product_cost":0,
         "product_cost_netto":0,
         "product_profit":36000,
         "product_profit_netto":36000,
         "bonus_accrual":0,
         "tax_value":0,
         "tax_type":0,
         "tax_fiscal":0,
         "category_id":33
      }
   ]
}
Метод возвращает список продуктов по всем транзакциям.

HTTP GET запрос
GET https://joinposter.com/api/dash.getTransactionProducts

GET-параметры запроса dash.getTransactionsProducts
Параметр	Описание
transactions_id	Обязательный параметр, список ID заказов (номеров чеков) записанных через запятую
Параметры ответа dash.getTransactionsProducts
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит массив объектов, внутри которого есть следующие параметры:

Параметр	Описание
transaction_id	ID чека
product_id	ID товара
product_name	Название товара
modification_id	ID модификатора. Если без модификатора то 0.
modificator_name	Название модификатора
modificator_barcode	Штрих-код модификатора
modificator_product_code	SKU модификатора
num	Количество товара в чеке
time	Время последнего обновления количества товара в чеке, измеряется в миллисекундах.
workshop	ID цеха
barcode	Штрих-код товара
product_code	SKU товара
tax_id	ID налога
fiscal	Признак фискального чека: 1 — фискальный, 0 — нефискальный
nodiscount	Признак распространяются ли скидки и бонусы на товар: 0 — да, 1 — нет.
payed_sum	Уплаченная сумма в копейках
product_sum	Стоимость товара в копейках
discount	Процент скидки примененный к чеку
bonus_sum	Сумма бонуса в гривнах
client_id	ID клиента
promotion_id	ID акции
cert_sum	Сумма уплаченная сертификатом
product_cost	Себестоимость товара
product_cost_netto	Себестоимость товара без НДС. Возвращается если включена настройка «Считать себестоимость и прибыль нетто».
product_profit	Прибыль
product_profit_netto	Прибыль без НДС. Возвращается если включена настройка «Считать себестоимость и прибыль нетто».
bonus_accrual	Начислено бонусов
tax_value	Процент налога от суммы чека
tax_type	Тип налога: 1 — налог с продаж, 2 — налог с оборота, 3 — НДС, 4 — без налога.
tax_fiscal	Налог по фискальному регистратору.
category_id	ID категории, в которой содержится товар.
📝 Изменить документацию

 Previous
Получить товары в чеке
Next 
Получить историю чека
dash.getTransactionHistory: Получить историю чека
Пример запроса
JS
javascript
const url = 'https://joinposter.com/api/dash.getTransactionHistory?token=687409:4164553abf6a031302898da7800b59fb&transaction_id=388678';
PHP
Postman
Пример ответа
json
{
  "response":[
    {
      "transaction_id":"388678",
      "type_history":"print",
      "time":"1507703522429",
      "value":"1",
      "value2":"2147483647",
      "value3":"0",
      "value_text":null,
      "spot_tablet_id":"1"
    },
    {
      "transaction_id":"388678",
      "type_history":"close",
      "time":"1507703520358",
      "value":"3",
      "value2":"145000",
      "value3":"0",
      "value_text":"{\"payments\":{\"cash\":1450}}",
      "spot_tablet_id":"1"
    },
    {
      "transaction_id":"388678",
      "type_history":"additem",
      "time":"1507703508927",
      "value":"168",
      "value2":"0",
      "value3":"0",
      "value_text":"{\"price\":450}",
      "spot_tablet_id":"1"
    },
    {
      "transaction_id":"388678",
      "type_history":"open",
      "time":"1507703507594",
      "value":"1",
      "value2":"95",
      "value3":"3",
      "value_text":null,
      "spot_tablet_id":"1"
    }
  ]
}
Метод возвращает историю действий по чеку.

HTTP GET запрос
GET https://joinposter.com/api/dash.getTransactionHistory

GET-параметры запроса dash.getTransactionHistory
Параметр	Описание
transaction_id	Обязательный параметр, номер чека
Параметры ответа dash.getTransactionHistory
Параметр	Описание
response	Объект ответа
Внутри параметра response находится массив объектов, каждый из которых содержит:

Параметр	Описание
transaction_id	Номер чека
type_history	Действие, совершённое над чеком. Возможные значения указаны ниже
time	Время действия в миллисекундах
spot_tablet_id	ID кассы
value_text	Текстовое значение, соответствующее действию. Может содержать JSON
value, value2, value3	В зависимости от type_history обозначает следующее:
Значения параметров value, value2, value3 в зависимости от type_history:

open - Открыт счёт
value - id официанта
value2 - id стола
value3 - 0
value4 - тип заказа: 1 — в заведении, 2 — с собой, 3 — доставка
comment - Добавлен комментарий
value - 0
value2 - 0
value3 - 0
value_text - текст комментария
dash.getTransactionWriteOffs: Получить списание по чеку
Пример запроса
JS
javascript

const url = 'https://joinposter.com/api/dash.getTransactionWriteoffs?token=687409:4164553abf6a031302898da7800b59fb&transaction_id=388678';
PHP
Postman
Пример ответа
json
{
  "response":[
    {
      "write_off_id":"1518199",
      "tr_product_id":"2125168",
      "storage_id":"1",
      "ingredient_id":"833",
      "product_id":"168",
      "modificator_id":"0",
      "prepack_id":"0",
      "weight":"1.00000",
      "unit":"p",
      "cost":22.13,
      "cost_netto":18.44,
      "time":"1507703520358"
    },
    {
      "write_off_id":"1518200",
      "tr_product_id":"2125169",
      "storage_id":"1",
      "ingredient_id":"85",
      "product_id":"169",
      "modificator_id":"0",
      "prepack_id":"0",
      "weight":0.04,
      "unit":"l",
      "cost":1.24,
      "cost_netto":1.03,
      "time":"1507703520358"
    },
    {
      "write_off_id":"1518201",
      "tr_product_id":"2125169",
      "storage_id":"1",
      "ingredient_id":"78",
      "product_id":"169",
      "modificator_id":"0",
      "prepack_id":"0",
      "weight":0.059,
      "unit":"kg",
      "cost":2.12,
      "cost_netto":1.77,
      "time":"1507703520358"
    },
    {
      "write_off_id":"1518202",
      "tr_product_id":"2125169",
      "storage_id":"1",
      "ingredient_id":"84",
      "product_id":"169",
      "modificator_id":"0",
      "prepack_id":"0",
      "weight":0.128,
      "unit":"kg",
      "cost":2.68,
      "cost_netto":2.23,
      "time":"1507703520358"
    },
    {
      "write_off_id":"1518203",
      "tr_product_id":"2125169",
      "storage_id":"1",
      "ingredient_id":"86",
      "product_id":"169",
      "modificator_id":"0",
      "prepack_id":"0",
      "weight":0.608,
      "unit":"kg",
      "cost":37.35,
      "cost_netto":31.13,
      "time":"1507703520358"
    },
    {
      "write_off_id":"1518204",
      "tr_product_id":"2125170",
      "storage_id":"1",
      "ingredient_id":"97",
      "product_id":"908",
      "modificator_id":"68",
      "prepack_id":"918",
      "weight":0.15,
      "unit":"kg",
      "cost":0.43,
      "cost_netto":0.36,
      "time":"1507703520358"
    }
  ]
}
Метод получает все списания по чеку.

HTTP GET запрос
GET https://joinposter.com/api/dash.getTransactionWriteoffs

GET-параметры запроса dash.getTransactionWriteOffs
Параметр	Описание
transaction_id	Обязательный параметр, id заказа (номер чека)
Параметры ответа dash.getTransactionWriteOffs
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит объект, внутри которого есть следующие параметры:

Параметр	Описание
write_off_id	ID списания
transaction_id	Номер чека
storage_id	ID склада откуда произошло списание
to_storage	ID склада куда переместили, передается если проводили перемещение
ingredient_id	ID ингредиента
product_id	ID товара
modificator_id	ID модификатора, если без модификатора — 0
prepack_id	ID полуфабриката
weight	Количество
unit	Единица измерения ингредиента: kg — килограммы, p — штуки, l — литры
cost	Стоимость ингредиента умноженная на кол-во в гривнах
cost_netto	Стоимость ингредиента умноженная на кол-во в гривнах без НДС. Возвращается если включена настройка «Считать себестоимость и прибыль нетто».
user_id	ID официанта
type	Тип действия: 4 — перемещение, 1 — списание, 2 — ручное списание
time	Дата списания в формате unixtimestamp
reason	Причина списания
📝 Изменить документацию

 Previous
Получить историю чека
Next 
Статистика по продажам
dash.getAnalytics: Получить статистику по продажам
Пример запроса
JS
javascript

const url = 'https://joinposter.com/api/dash.getAnalytics?format=json
&token=687409:4164553abf6a031302898da7800b59fb
&dateFrom=20241009
&dateTo=20241012
&interpolate=week
&type=waiters';
PHP
Postman
Пример ответа
json
{
  "response":{
    "data":[
      "169255.7100",
      "160327.7300",
      "48259.0100",
      "1470.0000"
    ],
    "data_hourly":[
      "36520.2400",
      "17785.4500",
      "19163.5600",
      "12688.5200",
      0,
      0,
      0,
      0,
      "13747.4500",
      "19465.3900",
      "8701.5900",
      "12727.5300",
      "12029.0000",
      "18482.3600",
      "18391.7200",
      "25149.2900",
      "23136.1600",
      "15255.1100",
      "14300.2800",
      "17448.0000",
      "28419.3000",
      "23969.5500",
      "19392.5800",
      "22539.3700"
    ],
    "data_weekday":[
      0,
      "169255.7100",
      "160327.7300",
      "48259.0100",
      "1470.0000",
      0,
      0
    ],
    "counters":{
      "revenue":"379312.4500",
      "profit":"315131.6900",
      "transactions":"248",
      "visitors":"744",
      "average_receipt":1535.6779352227,
      "average_time":"125.76268347"
    }
  }
}
Метод возвращает статистику по продажам.

HTTP GET запрос
GET https://joinposter.com/api/dash.getAnalytics

GET-параметры запроса dash.getAnalytics
Параметр	Описание
dateFrom	Опциональный параметр, дата начала периода в формате Ymd. Если не указана, будут выданы все продажи за последние 30 дней от dateTo.
dateTo	Опциональный параметр, дата конца периода в формате Ymd. По умолчанию текущая дата.
interpolate	Опциональный параметр, вывод по: дням — day, неделям — week, месяцам — month. По умолчанию day.
select	Опциональный параметр, тип выборки: оборот — revenue, прибыть — profit, средний чек — average_receipt, кол-во чеков — transactions, кол-во клиентов — visitors, среднее время — average_time. По умолчанию revenue.
type	Опциональный параметр, тип статистики: по официанту — waiters, цеху — workshop, категории — category, товару — products, заведению — spots, клиенту — clients. По умолчанию все.
id	Опциональный параметр, ID сущности по которой вернется выборка, например: ID официанта, цеха, категории, товара, заведения, клиента. Обязателен для типов workshop, category, products и spots; для waiters и clients можно не указывать, чтобы получить данные по всем сотрудникам или клиентам.
business_day	Если true то статистика продаж будет возвращаться по тому бизнес дню, в который попадает dateFrom время. По умолчанию false.
В зависимости от значения параметра type предполагается разный формат ответа.

Параметры ответа dash.getAnalytics, если type — waiters
Внутри параметра response лежит массив с объектами. Каждый объект содержит такие параметры:

Параметр	Описание
user_id	ID сотрудника
name	Имя сотрудника
sum	Сумма всех товаров по заказам для текущего официанта в гривнах
profit	Суммарная выручка по счетам
revenue	Сумма реальных оплат по счетам
clients	Кол-во закрытых чеков
middle_time	Среднее время обслуживания заказа
Параметры ответа dash.getAnalytics, если type — clients
Внутри параметра response лежит массив с объектами. Каждый объект содержит такие параметры:

Параметр	Описание
client_id	ID клиента
firstname	Имя клиента
lastname	Фамилия клиента
sum	Сумма всех товаров в каждом заказе в копейках
profit	Суммарная выручка по счетам
revenue	Сумма реальных оплат по счетам в копейках
payed_cash	Сумма оплат наличными
payed_card	Сумма оплат картой
payed_third_party	Сумма оплат сторонними сервисами
clients	Кол-во закрытых чеков
phone	Телефон клиента
email	Эл. почта
Параметры ответа dash.getAnalytics, если type — workshop, category, products, spots
Внутри параметра response лежит объект с параметрами:

Параметр	Описание
data	Массив сумм продаж сгруппированных в зависимости от параметров interpolate и type.
data_hourly	Массив значений разбитых по по часам. Сумма в гривнах.
data_weekday	Массив сумм продаж разбитых по дням недели. Сумма в гривнах.
counters	Счетчики основных показателей за данный период. Сумма в гривнах.
transaction_id	Номер заказа.
dash.getProductsSales: Получить продажи по товарам
Пример запроса
JS
javascript

const url = 'https://joinposter.com/api/dash.getProductsSales
?token=687409:4164553abf6a031302898da7800b59fb';
PHP
Postman
Пример ответа
{
  "response":[
    {
      "product_name":"Стейк из сёмги",
      "modificator_name":null,
      "product_id":"168",
      "modification_id":"0",
      "delete":"0",
      "left":"43",
      "right":"44",
      "category_id":"33",
      "count":"171.0000",
      "weight_flag":"0",
      "payed_sum":"7650000",
      "product_sum":"7695000",
      "bonus_sum":"0",
      "cert_sum":"45000",
      "product_profit":"7199716",
      "product_profit_netto":"5999763",
      "tax_sum":"72000",
      "vat_sum":"0",
      "unit":"p",
      "discount":45000
    },
    {
      "product_name":"Речная форель в фольге",
      "modificator_name":null,
      "product_id":"169",
      "modification_id":"0",
      "delete":"0",
      "left":"43",
      "right":"44",
      "category_id":"33",
      "count":"168.0000",
      "weight_flag":"0",
      "payed_sum":"9185000",
      "product_sum":"9240000",
      "bonus_sum":"0",
      "cert_sum":"55000",
      "product_profit":"8367880",
      "product_profit_netto":"6973233",
      "tax_sum":"88000",
      "vat_sum":"0",
      "unit":"p",
      "discount":55000
    }
  ]
}
Copy to clipboardErrorCopied
Метод возвращает продажи по товарам.
HTTP GET запрос
GET https://joinposter.com/api/dash.getProductsSales

GET-параметры запроса dash.getProductsSales
Параметр	Описание
spot_id	Опциональный параметр, ID заведения по которому возвращать статистику.
date_from	Опциональный параметр, дата начала выборки в формате Ymd, включительно. По умолчанию дата месяц назад.
date_to	Опциональный параметр, дата конца выборки в формате Ymd, включительно. По умолчанию дата текущего дня.
Параметры ответа dash.getProductsSales
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит массив объектов. Внутри каждого объекта есть следующие параметры:

Параметр	Описание
product_name	Название товара
product_id	ID товара
modification_id	ID модификатора, 0 если товар без модификатора
modification_name	Название модификатора, null если товар без модификатора
category_id	ID категории товара
left	ID категории слева
right	ID категории справа
price	Стоимость товара
count	Количество проданного товара
weight_flag	Признак весового товара, 0 — не весовой, 1 — если весовой
payed_sum	Сумма уплаченная "живыми деньгами c учетом скидки", равна payed_cash + payed_card
product_sum	Цена в копейках
product_profit	Прибыль в копейках
product_profit_netto	Прибыль без НДС в копейках. Возвращается если включена настройка «Считать себестоимость и прибыль нетто»
discount	Сумма скидка в копейках
delete	Признак удален ли товар: 0 — не удален, 1 — удален
📝 Изменить документацию

 Previous
Статистика по продажам
Next 
Продажи по категориям
dash.getCategoriesSales: Получить продажи по категориям
Пример запроса
JS
javascript

const url = 'https://joinposter.com/api/dash.getCategoriesSales
?token=687409:4164553abf6a031302898da7800b59fb
&dateFrom=20240920
&dateTo=20240922'
PHP
Postman
Пример ответа
{
  "response":[
    {
      "revenue":"38568300",
      "profit":"36307114",
      "profit_netto":"30255928",
      "count":"1173",
      "category_name":"Вторые блюда",
      "category_id":"33"
    },
    {
      "revenue":"36970440",
      "profit":"21885184",
      "profit_netto":"18237653",
      "count":"863",
      "category_name":"Главный экран",
      "category_id":0
    },
    {
      "revenue":"34474000",
      "profit":"31377831",
      "profit_netto":"26148193",
      "count":"830",
      "category_name":"Салаты",
      "category_id":"31"
    },
    {
      "revenue":"33876200",
      "profit":"31379225",
      "profit_netto":"26149354",
      "count":"905",
      "category_name":"Торты",
      "category_id":"37"
    },
    {
      "revenue":"22781920",
      "profit":"18568329",
      "profit_netto":"15473608",
      "count":"1173",
      "category_name":"Кофе",
      "category_id":"10"
    }
  ]
}
Copy to clipboardErrorCopied
Метод возвращает продажи по категориям.

HTTP GET запрос
GET https://joinposter.com/api/dash.getCategoriesSales

GET-параметры запроса dash.getCategoriesSales
Параметр	Описание
dateFrom	Дата начала для выборки в формате Ymd. Если не указана, начальная дата считается на месяц позже.
dateTo	Дата конца для выборки в формате Ymd. Если не указана, конечная дата считается текущей.
spot_id	ID заведения, если не указана, будут выданы по всем заведениям.
Параметры ответа dash.getCategoriesSales
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит массив объектов. Внутри каждого объекта есть следующие параметры:

Параметр	Описание
revenue	Сумма выручки в копейках
profit	Сумма прибыли в копейках
profit_netto	Сумма прибыли без НДС в копейках. Возвращается если включена настройка «Считать себестоимость и прибыль нетто».
count	Количество продаж
category_name	Название категории
category_id	ID категории
📝 Изменить документацию

 Previous
Продажи по товарам
Next 
Продажи по клиентам
dash.getClientsSales: Получить продажи по клиентам
Пример запроса
JS
javascript

const url = 'https://joinposter.com/api/dash.getClientsSales
?token=687409:4164553abf6a031302898da7800b59fb
&dateFrom=20240920
&dateTo=20240922';
PHP
Postman
Приклад ответа
json

{
  "response":[
    {
      "client_id": "4",
      "firstname":"",
      "lastname": "Владислав",
      "sum": "1030000",
      "profit": "825364",
      "profit_netto":"687803",
      "revenue": "907000",
      "clienst": "3",
      "middle_invoice":3433.3333333333
    }
  ]
}
Метод возвращает продажи по клиентам.

HTTP GET запрос
GET https://joinposter.com/api/dash.getClientsSales

GET-параметры запроса dash.getClientsSales
Параметр	Описание
dateFrom	Дата начала для выборки в формате Ymd. Если не указана, начальная дата считается на месяц позже.
dateTo	Дата конца для выборки в формате Ymd. Если не указана, конечная дата считается текущей.
Параметры ответа dash.getClientsSales
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит массив объектов. Внутри каждого объекта есть следующие параметры:

Параметр	Описание
client_id	ID клиента
firstname	Имя клиента
lastname	Фамилия клиента
sum	Общая сумма заказов в копейках
profit	Прибыль в копейках
profit_netto	Прибыль без НДС в копейках. Возвращается если включена настройка «Считать себестоимость и прибыль нетто».
revenue	Сумма выручки в копейках
clients	Количество чеков
middle_invoice	Сумма среднего чека в гривнах
📝 Изменить документацию

 Previous
Продажи по категориям
Next 
Продажи по официантам
dash.getWaitersSales: Получить продажи по официантам
Пример запроса
JS
javascript

const url = 'https://joinposter.com/api/dash.getWaitersSales
?token=687409:4164553abf6a031302898da7800b59fb
&dateFrom=20240901';
PHP
Postman
Пример ответа
json 
{
  "response":[
    {
      "user_id":"1",
      "name":"Demo",
      "profit":"153707331",
      "profit_netto":"128089443",
      "revenue":"186224294",
      "clients":"1414",
      "middle_time":49364.020916667,
      "middle_invoice":1317.0034936351
    },
    {
      "user_id":"2",
      "name":"Максим",
      "profit":"147406757",
      "profit_netto":"122838964",
      "revenue":"179108697",
      "clients":"1314",
      "middle_time":58078.986483333,
      "middle_invoice":1363.0798858447
    },
    {
      "user_id":"6",
      "name":"Антон",
      "profit":"155127873",
      "profit_netto":"129273228",
      "revenue":"188413623",
      "clients":"1424",
      "middle_time":1.8170166666667,
      "middle_invoice":1323.129375
    }
  ]
}
Метод возвращает продажи по официантам.

HTTP GET запрос
GET https://joinposter.com/api/dash.getWaitersSales

GET-параметры запроса dash.getWaitersSales
Параметр	Описание
dateFrom	Опциональный параметр, дата начала выборки в формате Ymd, включает указанный день. По умолчанию дата месяц назад.
dateTo	Опциональный параметр, дата конца выборки в формате Ymd, включает указанный день. По умолчанию дата текущего дня.
Параметры ответа dash.getWaitersSales
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит объект, внутри которого есть следующие параметры:

Параметр	Описание
user_id	ID официанта
name	Имя официанта
revenue	Сумма выручки в копейках
profit	Прибыль в копейках
profit_netto	Прибыль без НДС в копейках. Возвращается если включена настройка «Считать себестоимость и прибыль нетто».
clients	Количество закрытых чеков
middle_invoice	Средний чек в гривнах
middle_time	Общее время, потраченное на обслуживание в минутах
worked_time	Отработанное время, официанта в минутах
📝 Изменить документацию

 Previous
Продажи по клиентам
Next 
Продажи по заведениям
dash.getSpotsSales: Получить продажи по заведениям
Пример запроса
JS
javascript

const url = 'https://joinposter.com/api/dash.getSpotsSales
?token=687409:4164553abf6a031302898da7800b59fb
&dateFrom=20240905
&dateTo=20240908';
PHP
Postman
Пример ответа
json
{
  "response":{
    "revenue":536723.37,
    "profit":448025.64,
    "profit_netto":373354.7,
    "clients":423,
    "middle_invoice":1268.8495744681
  }
}
Метод возвращает продажи по заведениям.

HTTP GET запрос
GET https://joinposter.com/api/dash.getSpotsSales

GET-параметры запроса dash.getSpotsSales
Параметр	Описание
dateFrom	Опциональный параметр, дата начала выборки в формате Ymd, включительно. По умолчанию дата месяц назад.
dateTo	Опциональный параметр, дата конца выборки в формате Ymd, включительно. По умолчанию дата текущего дня.
spot_id	Опциональный параметр, ID заведения по которому возвращать статистику. Если не указан, будут выданы по всем заведениям.
Параметры ответа dash.getSpotsSales
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит объект, внутри которого есть следующие параметры:

Параметр	Описание
revenue	Сумма выручки в копейках
profit	Прибыль в копейках
profit_netto	Прибыль без НДС в копейках. Возвращается если включена настройка «Считать себестоимость и прибыль нетто»
clients	Количество чеков
middle_invoice	Сумма среднего чека в гривнах
📝 Изменить документацию

 Previous
Продажи по официантам
Next 
Статистика оплат по дням/месяцам
dash.getPaymentsReport: Получить статистику по дням/месяцам
Пример запроса
JS
javascript

const url = 'https://joinposter.com/api/dash.getPaymentsReport
?token=687409:4164553abf6a031302898da7800b59fb
&date_from=20240501
&date_to=20240531'
PHP
Postman
Пример ответа
json
{
    "response": {
        "days": [
            {
                "date": "2024-05-23",
                "payed_cash_sum": "1607996",
                "payed_card_sum": "365552",
                "payed_cert_in_sum": "0",
                "payed_cert_out_sum": "0",
                "payed_bonus_sum": "0",
                "payed_incust_sum": "0",
                "payed_sum_sum": "1973548"
            },
            {
                "date": "2024-06-03",
                "payed_cash_sum": "1108969",
                "payed_card_sum": "1090915",
                "payed_cert_in_sum": "0",
                "payed_cert_out_sum": "0",
                "payed_bonus_sum": "0",
                "payed_incust_sum": "0",
                "payed_sum_sum": "2199884"
            }
        ],
        "total": {
            "payed_cash_sum": 2716965,
            "payed_card_sum": 1456467,
            "payed_third_party_sum": 0,
            "payed_cert_in_sum": 0,
            "payed_cert_out_sum": 0,
            "payed_bonus_sum": 0,
            "payed_incust_sum": 0,
            "payed_sum_sum": 4173432
        }
    }
}
Пример ответа по месяцам
json
{
    "response": {
        "days": [
            {
                "date": "2024-06",
                "payed_cash_sum": "27286420",
                "payed_card_sum": "1951853",
                "payed_cert_in_sum": "0",
                "payed_cert_out_sum": "0",
                "payed_bonus_sum": "0",
                "payed_incust_sum": "0",
                "payed_sum_sum": "29234560"
            },
            {
                "date": "2024-05",
                "payed_cash_sum": "60273456",
                "payed_card_sum": "6290658",
                "payed_cert_in_sum": "0",
                "payed_cert_out_sum": "0",
                "payed_bonus_sum": "0",
                "payed_incust_sum": "0",
                "payed_sum_sum": "66564114"
            },
            {
                "date": "2024-04",
                "payed_cash_sum": "49090724",
                "payed_card_sum": "4782295",
                "payed_cert_in_sum": "0",
                "payed_cert_out_sum": "0",
                "payed_bonus_sum": "0",
                "payed_incust_sum": "0",
                "payed_sum_sum": "53873019"
            }
        ],
        "total": {
            "payed_cash_sum": 136650600,
            "payed_card_sum": 13024806,
            "payed_third_party_sum": 0,
            "payed_cert_in_sum": 0,
            "payed_cert_out_sum": 0,
            "payed_bonus_sum": 0,
            "payed_incust_sum": 0,
            "payed_sum_sum": 149671693
        }
    }
}
Метод возвращает статистику оплат по дням. При отрезке времени больше чем 65 дней — по месяцам.

HTTP GET запрос
GET https://joinposter.com/api/dash.getPaymentsReport

GET-параметры запроса dash.getPaymentsReport
Параметр	Описание
spot_id	Опциональный параметр, ID заведения по которому возвращать статистику.
date_from	Опциональный параметр, дата начала выборки в формате Ymd, включительно. По умолчанию дата месяц назад.
date_to	Опциональный параметр, дата конца выборки в формате Ymd, включительно. По умолчанию дата текущего дня.
Параметры ответа dash.getPaymentsReport
Параметр	Описание
days	Список дней/месяцов в которых были оплаты
total	Общие суммы по всем дням
Внутри элемента days лежит массив, в каждом элементе которого есть следующие свойства:

Параметр	Описание
date	Дата в формате Y-m-d или Y-m при выводе по месяцам
payed_cash_sum	Оплата наличными в копейках
payed_card_sum	Оплата карточкой в копейках
payed_cert_in_sum	Оплата сертификатом в копейках. Приходит если в настройках администрирования включена опция "Учитывать оплату сертификатом".
payed_cert_out_sum	Оплата сертификатом в копейках. Приходит если в настройках администрирования выключена опция "Учитывать оплату сертификатом" и равноценна скидке.
payed_bonus_sum	Оплата бонусами
payed_incust_sum	Оплата incust
payed_sum_sum	Общая сумма оплат за этот день в копейках.
Внутри элемента total есть следующие свойства:

Параметр	Описание
payed_cash_sum	Общая сумма оплат наличными в копейках
payed_card_sum	Общая сумма оплат карточкой в копейках
payed_third_party_sum	Общая сумма оплат третьей стороной
payed_cert_in_sum	Общая сумма оплат сертификатом в копейках. Приходит если в настройках администрирования включена опция "Учитывать оплату сертификатом".
payed_cert_out_sum	Общая сумма оплат сертификатом в копейках. Приходит если в настройках администрирования выключена опция "Учитывать оплату сертификатом" и равноценна скидке.
payed_bonus_sum	Общая сумма оплат бонусами
payed_incust_sum	Общая сумма оплат incust
payed_sum_sum	Общая сумма всех оплат в копейках
📝 Изменить документацию

 Previous
Продажи по заведениям
menu: Меню

Методы для работы с разделом Меню. Все методы данного раздела начинаются с «menu». Список доступных методов:

menu.getCategories: Получить категории товаров
menu.getCategory: Получить категорию товаров
menu.createCategory: Создать категории товаров
menu.updateCategory: Изменить категорию товаров
menu.removeCategory: Удалить категорию товаров
menu.recoverCategory: Восстановить категорию товаров
menu.getProducts: Получить товары и тех. карты
menu.getProduct: Получить товар / тех. карту
menu.createProduct: Создать товар
menu.updateProduct: Изменить товар
menu.updateProductPrice: Изменить цену товара
menu.removeProduct: Удалить товар
menu.recoverProduct: Восстановить товар
menu.createDish: Создать тех карту
menu.updateDish: Изменить тех. карту
menu.removeDish: Удалить тех. карту
menu.recoverDish: Восстановить тех. карту
menu.getPrepacks: Получить полуфабрикаты
menu.getPrepack: Получить полуфабрикат
menu.createPrepack: Создать полуфабрикат
menu.updatePrepack: Изменить полуфабрикат
menu.removePrepack: Удалить полуфабрикат
menu.getIngredients: Получить ингредиенты
menu.getIngredient: Получить ингредиент
menu.createIngredients: Создать ингредиенты
menu.createIngredient: Создать ингредиент
menu.updateIngredients: Изменить ингредиенты
menu.updateIngredient: Изменить ингредиент
menu.removeIngredient: Удалить ингредиент
menu.getCategoriesIngredients: Получить категории ингредиентов
menu.getCategoryIngredients: Получить категорию ингредиентов
menu.createCategoryIngredients: Создать категории ингредиентов
menu.updateCategoryIngredients: Изменить категории ингредиентов
menu.removeCategoryIngredients: Удалить категорию ингредиентов
menu.getWorkshops: Получить цеха
menu.getWorkshop: Получить цех
menu.createWorkshop: Создать цех
menu.updateWorkshop: Изменить цех
menu.removeWorkshop: Удалить цех
📝 Изменить документацию

 Previous
Статистика
Next 
Склад
menu.getCategories: Список категорий товаров
Пример запроса:

<?php
$url = 'https://joinposter.com/api/menu.getCategories'
 . '?token=687409:4164553abf6a031302898da7800b59fb'
 . '&fiscal=0';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":[  
    {  
      "category_id":"2",
      "category_name":"Роллы",
      "category_photo":"/upload/pos_cdb_888/menu/category_1420674791_2.jpg",
      "parent_category":"0",
      "category_color":"white",
      "category_hidden":"0",
      "sort_order":"999",
      "fiscal":"0",
      "nodiscount":"0",
      "tax_id":"0",
      "left":"3",
      "right":"4",
      "level":"1",
      "category_tag":"sushi"
    }
  ]
}
Copy to clipboardErrorCopied
Метод возвращает список категорий товаров.

HTTP запрос
GET https://joinposter.com/api/menu.getCategories

GET-параметры запроса menu.getCategories
Параметр	Описание
fiscal	Фискальный признак категорий: 0 — нефискальные, 1 — фискальные. По умолчанию — все категории.
id_1c	Позволяет вернуть в ответе ID категории товаров в системе 1С. В качестве значения необходимо передать true. По умолчанию не передаётся.
Параметры ответа menu.getCategories
Параметр	Описание
response	Массив объектов
Внутри параметра response лежит массив, в каждом элементе которого есть следующие параметры:

Параметр	Описание
category_id	ID категории
category_name	Название категории
category_photo	Фотография категории
parent_category	ID родительской категории
category_color	Цвет категории
category_hidden	Признак, что категория скрыта: 0 — не скрыта, 1 — скрыта
sort_order	Порядок сортировки
fiscal	Признак фискальности категории: 0 — нефискальная, 1 — фискальная
nodiscount	Признак, что распространяются скидки: 0 — не распространяются, 1 — распространяются
tax_id	ID налога
left	ID категории слева (по Nested Set)
right	ID катергории справа (по Nested Set)
level	Уровень вложенности ветки дерева категорий (по Nested Set)
category_tag	Предполагаемый тип продуктов в категории, который определил алгоритм машинного обучения. Например, coffee, alcohol, может быть null.
id_1c	ID категории товаров в системе 1С
📝 Изменить документацию

Next 
Получить категорию товаров
menu.getCategory: Свойства категории товаров
Пример запроса:

<?php
$url = 'https://joinposter.com/api/menu.getCategory'
 . '?token=687409:4164553abf6a031302898da7800b59fb'
 . '&category_id=30'
 . '&1c=true';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":{  
    "category_id":30,
    "category_name":"Бар",
    "category_photo":null,
    "category_photo_origin":null,
    "parent_category":0,
    "category_color":"yellow",
    "category_hidden":0,
    "sort_order":3,
    "fiscal":0,
    "nodiscount":0,
    "tax_id":2,
    "left":7,
    "right":42,
    "level":1,
    "category_tag":"alco",
    "visible":[
      {
        "spot_id": 1,
        "visible": 1
      },
      {
        "spot_id": 2,
        "visible": 0
      }
    ],
    "id_1c":"9c68dbc9-b255-11e6-9a8f-ace01035e460"
  }
}
Copy to clipboardErrorCopied
Метод возвращает свойства категории товаров.

HTTP запрос
GET https://joinposter.com/api/menu.getCategory

GET-параметры запроса menu.getCategory
Параметр	Описание
category_id	Id категории
1c	Позволяет вернуть в ответе ID категории товаров в системе 1С. В качестве значения необходимо передать true. По умолчанию не передаётся.
Параметры ответа menu.getCategory
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит объект, внутри которого есть следующие параметры:

Параметр	Описание
category_id	ID категории
category_name	Название категории
category_photo	Фотография категории
category_photo_origin	Оригинал загруженной фотографии
parent_category	ID родительской категории
category_color	Цвет категории
category_hidden	Признак, что категория скрыта: 0 — не скрыта, 1 — скрыта
sort_order	Порядок сортировки
fiscal	Признак фискальности категории: 0 — нефискальная, 1 — фискальная
nodiscount	Признак, что распространяются скидки: 0 — не распространяются, 1 — распространяются
tax_id	ID налога
left	ID категории слева (по Nested Set)
right	ID категории справа (по Nested Set)
level	Уровень вложенности ветки дерева категорий (по Nested Set)
category_tag	Предполагаемый тип продуктов в категории, который определил алгоритм машинного обучения. Например, coffee, alcohol, может быть null.
visible	Массив в каждом объекте которого есть признак видимости категории в заведении
id_1c	ID категории товаров в системе 1С
Внутри параметра visible лежит массив, в каждом элементе которого есть следующие параметры:

Параметр	Описание
spot_id	ID заведения
visible	Признак, что категория видна в этом заведении: 0 — скрыта, 1 — видна
📝 Изменить документацию

 Previous
Получить категории товаров
Next 
Создать категории товаров
menu.createCategory: Создание категории товаров

Пример запроса:

<?php
$url = 'https://joinposter.com/api/menu.createCategory'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$category = [
    'category_name'   => 'Пицца',
    'parent_category' => 0,
    'category_color'  => 'yellow',
    'category_hidden' => 0,
    'tax_id'          => 0,
];

$data = sendRequest($url, 'post', $category);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":52
}
Copy to clipboardErrorCopied
Метод создаёт категорию товаров.

HTTP запрос
POST https://joinposter.com/api/menu.createCategory

POST-параметры запроса menu.createCategory
Параметр	Описание
category_name	Название категории товаров
parent_category	ID родительской категории
category_color	Цвет категории: white, red, orange, yellow, green, blue, navy-blue, purple, black, mint-blue, lime-green, pink. По умолчанию принимает white.
category_hidden	Признак, что категория скрыта: 0 — не скрыта, 1 — скрыта. По умолчанию принимает 0.
tax_id	ID налога. По умолчанию принимает 0.
Параметры ответа menu.createCategory
Параметр	Описание
response	ID созданной категории товаров
📝 Изменить документацию

 Previous
Получить категорию товаров
Next 
Изменить категорию товаров
menu.updateCategory: Изменение свойств категории товаров
Пример запроса:

<?php
$url = 'https://joinposter.com/api/menu.updateCategory'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$category = [
    'category_id'     => 34,
    'category_name'   => 'Пицца',
    'parent_category' => 0,
    'category_color'  => 'red',
];

$data = sendRequest($url, 'post', $category);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response": 34
}
Copy to clipboardErrorCopied
Метод изменяет свойства категории товаров.

HTTP запрос
GET https://joinposter.com/api/menu.updateCategory

POST-параметры запроса menu.updateCategory
Параметр	Описание
category_id	ID категории товаров
category_name	Название категории товаров
parent_category	ID родительской категории
category_color	Цвет категории: white, red, orange, yellow, green, blue, navy-blue, purple, black, mint-blue, lime-green, pink. По умолчанию не передаётся.
category_hidden	Признак, что категория скрыта: 0 — не скрыта, 1 — скрыта. По умолчанию не передаётся.
tax_id	ID налога. По умолчанию не передаётся.
Параметры ответа menu.updateCategory
Параметр	Описание
response	ID изменённой категории товаров
📝 Изменить документацию

 Previous
Создать категории товаров
Next 
Удалить категорию товаров
menu.removeCategory: Удаление категории товаров
Пример запроса:

<?php
$url = 'https://joinposter.com/api/menu.removeCategory'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$category = [
    'category_id' => 52,
];

$data = sendRequest($url, 'post', $category);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":true
}
Copy to clipboardErrorCopied
Метод удаляет категорию товаров.

HTTP запрос
POST https://joinposter.com/api/menu.removeCategory

POST-параметры запроса menu.removeCategory
Параметр	Описание
category_id	ID категории товаров
Параметры ответа menu.removeCategory
Параметр	Описание
response	true, если категория товаров успешно удалена
📝 Изменить документацию

 Previous
Изменить категорию товаров
Next 
Восстановить категорию товаров
menu.recoverCategory: Восстановление категории
Пример запроса
PHP
php
<?php
$url = 'https://joinposter.com/api/menu.recoverCategory'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$category = [
    'category_id' => 48,
    'parent_category_id' => 10,
];

$data = sendRequest($url, 'post', $category);
cURL
Пример ответа:

{  
  "response":true
}
Copy to clipboardErrorCopied
Метод восстанавливает категорию.

HTTP запрос
POST https://joinposter.com/api/menu.recoverCategory

POST-параметры запроса menu.recoverCategory
Параметр	Описание
category_id	ID категории
parent_category_id	ID родительской категории меню
Параметры ответа menu.recoverDish
Параметр	Описание
response	true, если категория успешно восстановлена
📝 Изменить документацию

 Previous
Удалить категорию товаров
Next 
Получить товары и тех. карты
menu.getProducts: Список товаров и тех. карт
Пример запроса получения свойств товаров:

<?php
$url = 'https://joinposter.com/api/menu.getProducts'
 . '?token=687409:4164553abf6a031302898da7800b59fb'
 . '&category_id=15'
 . '&type=products';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{
   "response":[
      {
         "barcode":"4820098749621",
         "category_name":"Вода",
         "unit":"",
         "cost":"100",
         "cost_netto":"83",
         "fiscal":"0",
         "menu_category_id":"15",
         "workshop":"1",
         "nodiscount":"0",
         "photo":"/upload/4/menu/product_1403094564_139.jpg",
         "photo_origin":"/upload/4/menu/product_1403094564_139_original.jpg",
         "product_code":"",
         "product_id":"139",
         "product_name":"Borjomi",
         "sort_order":"999",
         "tax_id":"0",
         "product_tax_id":"2",
         "type":"3",
         "weight_flag":"0",
         "color":"white",
         "ingredient_id":"9",
         "cooking_time": "1201",
         "fiscal_code": null,
         "modifications":[
            {
               "modificator_id":"147",
               "modificator_name":"Сок яблочный для кальяна ",
               "modificator_selfprice":"0",
               "order":"0",
               "modificator_barcode":"",
               "modificator_product_code":"",
               "spots":[
                  {
                     "spot_id":"1",
                     "price":"68100",
                     "profit":"68100",
                     "profit_netto":"56750",
                     "visible":"1"
                  },
                  {
                     "spot_id":"2",
                     "price":"68100",
                     "profit":"68100",
                     "profit_netto":"56750",
                     "visible":"1"
                  },
                  {
                     "spot_id":"1",
                     "price":"68100",
                     "profit":"68100",
                     "profit_netto":"56750",
                     "visible":"1"
                  },
                  {
                     "spot_id":"2",
                     "price":"68100",
                     "profit":"68100",
                     "profit_netto":"56750",
                     "visible":"1"
                  }
               ],
               "sources":[
                  {
                     "id":"1",
                     "name":"Easy Eats",
                     "price":"18500",
                     "visible":"1"
                  },
                  {
                     "id":"2", 
                     "name":"Sonic Eats",
                     "price":"20500",
                     "visible":"1"
                  }
               ],
               "ingredient_id":"0",
               "fiscal_code": "1234567890"
            }
         ],
         "out":0
      },
      {
         "barcode":"",
         "category_name":"Вода",
         "unit":"",
         "cost":"654",
         "cost_netto":"545",
         "fiscal":"0",
         "menu_category_id":"15",
         "workshop":"3",
         "nodiscount":"0",
         "photo":"/upload/4/menu/product_1403094497_138.jpg",
         "photo_origin":"/upload/4/menu/product_1403094497_138_original.jpg",
         "product_code":"",
         "product_id":"138",
         "product_name":"Evian",
         "sort_order":"999",
         "tax_id":"0",
         "product_tax_id":"0",
         "type":"3",
         "weight_flag":"0",
         "color":"white",
         "spots":[
            {
               "spot_id":"1",
               "price":"19000",
               "profit":"18346",
               "profit_netto":"15288",
               "visible":"1"
            },
            {
               "spot_id":"2",
               "price":"19000",
               "profit":"18346",
               "profit_netto":"15288",
               "visible":"1"
            }
         ],
         "sources":[
            {
               "id":"1",
               "name":"Easy Eats",
               "price":"18500",
               "visible":"1"
            },
            {
               "id":"2",
               "name":"Sonic Eats",
               "price":"20500",
               "visible":"1"
            }
         ],
         "ingredient_id":"8",
         "cooking_time": "0",
         "fiscal_code": "1231231234",
         "out":0
      },
      {
         "barcode":"",
         "category_name":"Главный экран",
         "unit":"kg",
         "cost":"0",
         "cost_netto":"0",
         "fiscal":"0",
         "hidden":"0",
         "menu_category_id":"0",
         "workshop":"1",
         "nodiscount":"0",
         "photo":"",
         "photo_origin":null,
         "price":{
            "1":"30000",
            "2":"30000"
         },
         "product_code":"",
         "product_id":"30",
         "product_name":"Обеденное меню",
         "profit":{
            "1":"30000",
            "2":"30000"
         },
         "sort_order":"999",
         "tax_id":"0",
         "product_tax_id":"0",
         "type":"2",
         "weight_flag":"0",
         "color":"white",
         "spots":[
            {
               "spot_id":"1",
               "price":"30000",
               "profit":"30000",
               "profit_netto":"30000",
               "visible":"1"
            },
            {
               "spot_id":"2",
               "price":"30000",
               "profit":"30000",
               "profit_netto":"30000",
               "visible":"1"
            }
         ],
         "sources":[
            {
               "id":"1",
               "name":"Easy Eats",
               "price":"18500",
               "visible":"1"
            },
            {
               "id":"2",
               "name":"Sonic Eats",
               "price":"20500",
               "visible":"1"
            }
         ],
         "ingredient_id":"0",
         "cooking_time":"0",
         "different_spots_prices":"0",
         "fiscal_code":"",
         "group_modifications":[
            {
               "dish_modification_group_id":29,
               "name":"Напитки",
               "num_min":1,
               "num_max":3,
               "is_deleted":0,
               "modifications":[
                  {
                     "dish_modification_id":142,
                     "name":"Кола",
                     "ingredient_id":77,
                     "type":2,
                     "brutto":1,
                     "price":99.99,
                     "photo_orig":"",
                     "photo_large":"",
                     "photo_small":"",
                     "last_modified_time":"2020-05-26 15:33:30"
                  },
                  {
                     "dish_modification_id":143,
                     "name":"Фанта",
                     "ingredient_id":33,
                     "type":10,
                     "brutto":200,
                     "price":99.99,
                     "photo_orig":"",
                     "photo_large":"",
                     "photo_small":"",
                     "last_modified_time":"2020-05-26 15:33:30"
                  },
                  {
                     "dish_modification_id":147,
                     "name":"Спрайт",
                     "ingredient_id":39,
                     "type":10,
                     "brutto":200,
                     "price":99.99,
                     "photo_orig":"",
                     "photo_large":"",
                     "photo_small":"",
                     "last_modified_time":"2020-05-26 15:33:30"
                  }
               ]
            },
            {
               "dish_modification_group_id":30,
               "name":"Еда",
               "num_min":1,
               "num_max":999,
               "is_deleted":0,
               "modifications":[
                  {
                     "dish_modification_id":144,
                     "name":"Картофель фри",
                     "ingredient_id":0,
                     "type":0,
                     "brutto":0,
                     "price":99.99,
                     "photo_orig":"",
                     "photo_large":"",
                     "photo_small":"",
                     "last_modified_time":"2020-05-26 15:33:30"
                  },
                  {
                     "dish_modification_id":145,
                     "name":"Снэки",
                     "ingredient_id":178,
                     "type":10,
                     "brutto":200,
                     "price":99.99,
                     "photo_orig":"",
                     "photo_large":"",
                     "photo_small":"",
                     "last_modified_time":"2020-05-26 15:33:30"
                  }
               ]
            }
         ],
         "out":100,
         "product_production_description":"",
         "ingredients":[
            {
               "structure_id":"828",
               "ingredient_id":"32",
               "pr_in_clear":"0",
               "pr_in_cook":"0",
               "pr_in_fry":"0",
               "pr_in_stew":"0",
               "pr_in_bake":"0",
               "structure_unit":"kg",
               "structure_type":"1",
               "structure_brutto":100,
               "structure_netto":100,
               "structure_lock":"1",
               "structure_selfprice":"0",
               "structure_selfprice_netto":"0",
               "ingredient_name":"Sugar",
               "ingredient_unit":"kg",
               "ingredient_weight":0,
               "ingredients_losses_clear":"0",
               "ingredients_losses_cook":"0",
               "ingredients_losses_fry":"0",
               "ingredients_losses_stew":"0",
               "ingredients_losses_bake":"0"
            }
         ]
      }
   ]
}
Copy to clipboardErrorCopied
Пример запроса получения свойств тех. карт:

<?php
$url = 'https://joinposter.com/api/menu.getProducts'
 . '?token=687409:4164553abf6a031302898da7800b59fb'
 . '&category_id=5'
 . '&type=batchtickets';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{
  "response":[
    {
      "barcode":"3820055749143",
      "category_name":"Соки",
      "unit":"l",
      "cost":"0",
      "cost_netto":"0",
      "fiscal":"0",
      "hidden":"0",
      "menu_category_id":"5",
      "workshop":"1",
      "nodiscount":"0",
      "photo":"/upload/4/menu/product_1621962743_56.JPG",
      "photo_origin":"/upload/4/menu/product_1621962743_56_original.JPG",
      "price":{
        "1":"14500"
      },
      "product_code":"",
      "product_id":"56",
      "product_name":"Сок \"Ace\"",
      "profit":{
        "1":"14500"
      },
      "sort_order":"999",
      "tax_id":"0",
      "product_tax_id":"0",
      "type":"2",
      "weight_flag":"0",
      "color":"white",
      "spots":[
        {
          "spot_id":"1",
          "price":"14500",
          "profit":"14500",
          "profit_netto":"14500",
          "visible":"1"
        }
      ],
      "ingredient_id":"0",
      "cooking_time":"0",
      "different_spots_prices":"1",
      "sources":[
        {
          "id":"1",
          "name":"Easy Eats",
          "price":"12500",
          "visible":"1"
        },
        {
          "id":"2",
          "name":"Sonic Eats",
          "price":"13500",
          "visible":"1"
        }
      ],
      "group_modifications":[
        {
          "dish_modification_group_id":"15",
          "name":"Сладкие",
          "num_min":"0",
          "num_max":"999",
          "type":"2",
          "is_deleted":"0",
          "modifications":[
            {
              "dish_modification_id":"285",
              "name": "Персиковый",
              "ingredient_id":"253",
              "type":"10",
              "brutto":"1",
              "price":"0",
              "photo_orig":"",
              "photo_large":"/upload/4/modifications/16598379939111_modification.jpg",
              "photo_small":"/upload/4/modifications/16598379939111_modification_sm.jpg",
              "last_modified_time":"2022-08-07 05:11:29"
            },
            {
              "dish_modification_id":"286",
              "name":"Яблочный",
              "ingredient_id":"247",
              "type":"10",
              "brutto":"1",
              "price":"0",
              "photo_orig":"",
              "photo_large":"",
              "photo_small":"",
              "last_modified_time":"2021-09-23 17:26:53"
            }
          ]
        },
        {
          "dish_modification_group_id":"11",
          "name":"ПП",
          "num_min":"0",
          "num_max":"999",
          "type":"2",
          "is_deleted":"0",
          "modifications":[
            {
              "dish_modification_id":"433",
              "name":"Морковный",
              "ingredient_id":"242",
              "type":"10",
              "brutto":"1",
              "price":"10",
              "photo_orig":"",
              "photo_large":"/upload/4/modifications/16598375855197_modification.jpg",
              "photo_small":"/upload/4/modifications/16598375855197_modification_sm.jpg",
              "last_modified_time":"2022-08-07 05:11:28"
            }
          ]
        }
      ],
      "out":"0",
      "product_production_description":"",
      "ingredients":[]
    },
    {
      "barcode":"3820059949146",
      "category_name":"Соки",
      "unit":"l",
      "cost":"0",
      "cost_netto":"0",
      "fiscal":"0",
      "hidden":"0",
      "menu_category_id":"5",
      "workshop":"1",
      "nodiscount":"0",
      "photo":"/upload/pos_cdb_192017/menu/product_1621579507_22.JPG",
      "photo_origin":"/upload/pos_cdb_192017/menu/product_1621567507_2_original.JPG",
      "price":{
        "1":"10000"
      },
      "product_code":"",
      "product_id":"18",
      "product_name":"Сок \"Maverick\"",
      "profit":{
        "1":"10000"
      },
      "sort_order":"999",
      "tax_id":"0",
      "product_tax_id":"0",
      "type":"2",
      "weight_flag":"0",
      "color":"white",
      "spots":[
        {
          "spot_id":"1",
          "price":"10000",
          "profit":"10000",
          "profit_netto":"10000",
          "visible":"1"
        }
      ],
      "ingredient_id":"0",
      "cooking_time":"0",
      "different_spots_prices":"1",
      "sources":[
        {
          "id":"1",
          "name":"Easy Eats",
          "price":"12000",
          "visible":"1"
        },
        {
          "id":"2",
          "name":"Sonic Eats",
          "price":"8000",
          "visible":"1"
        }
      ],
      "group_modifications":[],
      "out":0,
      "product_production_description":"",
      "ingredients":[]
    }
  ]
}
Copy to clipboardErrorCopied
Метод возвращает список товаров и тех. карт.

HTTP запрос
GET https://joinposter.com/api/menu.getProducts

GET-параметры запроса menu.getProducts
Параметр	Описание
category_id	ID категории товаров. По умолчанию не передаётся.
type	Тип: products — товары, batchtickets — тех. карты. По умолчанию не передаётся.
Параметры ответа menu.getProducts
Параметр	Описание
response	Массив объектов
Внутри параметра response лежит массив, в каждом элементе которого есть следующие параметры:

Параметр	Описание
barcode	Штрихкод товара
category_name	Название категории в которой содержится товар
hidden	Признак что товар скрыт: 0 — виден, 1 — скрыт
unit	Единица измерения товара
cost	Себестоимость товара в копейках
cost_netto	Себестоимость товара без НДС в копейках. Возвращается если включена настройка «Считать себестоимость и прибыль нетто»
fiscal	Фискальный признак товара: 0 — нефискальный, 1 — фискальный
menu_category_id	ID категории, в которой содержится товар
workshop	ID цеха товара
nodiscount	Признак, могут ли применяться скидки к этому товару: 0 — не могут, 1 — могут
photo	Фотография товара
photo_origin	Оригинал фотографии товара
product_code	Складская учётная единица товара, например, SKU
product_id	ID товара
product_name	Название товара
sort_order	Порядок сортировки товара
tax_id	ID налога товара
product_tax_id	Признак, что налог товара унаследован от налога категории: 0 — не унаследован, 1 — унаследован
type	Тип товара: 1 — полуфабрикат, 2 — тех.карта, 3 — товар
weight_flag	Признак, что товар весовой: 0 — не весовой, 1 — весовой
color	Цвет карточки товара на кассе
spots	Заведения, в которых доступен товар
sources	Источники заказа, в которых доступен товар
ingredient_id	ID ингредиента (возвращается, если товар)
cooking_time	Время приготовления блюда в секундах
product_production_description	Описание процесса приготовления
fiscal_code	Код УКТ ВЭД. Доступен только для аккаунтов из Украины, использующих фискализацию
group_modifications	Наборы модификаторов тех.карты. Возвращается, если у тех.карты есть модификаторы
out	Сумма нетто всех ингредиентов тех. карты, для товара всегда 0
ingredients	Список ингредиентов (возвращается, если тех. карта)
menu.getProduct: Свойства товара или тех. карты
Пример запроса получения свойств товара:

<?php
$url = 'https://joinposter.com/api/menu.getProduct'
 . '?token=687409:4164553abf6a031302898da7800b59fb'
 . '&product_id=142';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":{  
    "barcode":"",
    "category_name":"Свежевыжатые соки",
    "unit":"",
    "cost":"1880",
    "cost_netto":"1567",
    "fiscal":"0",
    "hidden":"0",
    "menu_category_id":"16",
    "workshop":"4",
    "nodiscount":"0",
    "photo":"/upload/4/menu/product_1403094607_140.jpg",
    "product_code":"",
    "product_id":"140",
    "product_name":"Апельсиновый",
    "sort_order":"1",
    "tax_id":"0",
    "product_tax_id":"0",
    "type":"3",
    "weight_flag":"0",
    "color":"white",
    "spots":[  
      {  
        "spot_id":"1",
        "price":"40000",
        "profit":"38120",
        "profit_netto":"31767",
        "visible":"1"
      },
      {  
        "spot_id":"2",
        "price":"40000",
        "profit":"38120",
        "profit_netto":"31767",
        "visible":"1"
      }
    ],
    "sources":[
      {
        "id":"1", 
        "name":"Easy Eats",
        "price":"18500",
        "visible":"1"
      },
      {
        "id":"2",
        "name":"Sonic Eats",
        "price":"20500",
        "visible":"1"
      }
    ],
    "ingredient_id":"10",
    "cooking_time": "1201",
    "fiscal_code": "1234567890",
    "out":"0"
  }
}
Copy to clipboardErrorCopied
Пример запроса получения свойств тех. карты:

<?php
$url = 'https://joinposter.com/api/menu.getProduct'
 . '?token=687409:4164553abf6a031302898da7800b59fb'
 . '&product_id=175';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":{  
    "barcode":"123456",
    "category_name":"Коктейли",
    "unit":"kg",
    "cost":"444",
    "cost_netto":"370",
    "fiscal":"0",
    "menu_category_id":"39",
    "workshop":"1",
    "nodiscount":"0",
    "photo":"/upload/pos_cdb_4/menu/product_1439375876_175.jpg",
    "product_code":"",
    "product_id":"175",
    "product_name":"Manhattan Jack",
    "sort_order":"999",
    "tax_id":"0",
    "product_tax_id":"0",
    "type":"2",
    "weight_flag":"0",
    "color":"white",
    "spots":[  
      {  
        "spot_id":"1",
        "price":"60000",
        "profit":"59556",
        "profit_netto":"49630",
        "visible":"1"
      },
      {  
        "spot_id":"2",
        "price":"60000",
        "profit":"59556",
        "profit_netto":"49630",
        "visible":"1"
      }
    ],
    "sources":[
      {
        "id":"1",
        "name":"Easy Eats",
        "price":"18500",
        "visible":"1"
      },
      {
        "id":"2",
        "name":"Sonic Eats",
        "price":"20500",
        "visible":"1"
      }
    ],
    "ingredient_id":"0",
    "fiscal_code": "1234567890",
    "out":97,
    "product_production_description":"",
    "ingredients":[  
      {  
        "structure_id":"52",
        "ingredient_id":"92",
        "pr_in_clear":"0",
        "pr_in_cook":"0",
        "pr_in_fry":"0",
        "pr_in_stew":"0",
        "pr_in_bake":"0",
        "structure_unit":"l",
        "structure_type":"1",
        "structure_brutto":30,
        "structure_netto":30,
        "structure_lock":"1",
        "structure_selfprice":"102",
        "structure_selfprice_netto":"85",
        "ingredient_name":"Красный вермут",
        "ingredient_unit":"l",
        "ingredient_weight":"0",
        "ingredients_losses_clear":"0",
        "ingredients_losses_cook":"0",
        "ingredients_losses_fry":"0",
        "ingredients_losses_stew":"0",
        "ingredients_losses_bake":"0"
      },
      {  
        "structure_id":"53",
        "ingredient_id":"91",
        "pr_in_clear":"0",
        "pr_in_cook":"0",
        "pr_in_fry":"0",
        "pr_in_stew":"0",
        "pr_in_bake":"0",
        "structure_unit":"l",
        "structure_type":"1",
        "structure_brutto":60,
        "structure_netto":60,
        "structure_lock":"1",
        "structure_selfprice":"313",
        "structure_selfprice_netto":"261",
        "ingredient_name":"Jack Daniels",
        "ingredient_unit":"l",
        "ingredient_weight":"0",
        "ingredients_losses_clear":"0",
        "ingredients_losses_cook":"0",
        "ingredients_losses_fry":"0",
        "ingredients_losses_stew":"0",
        "ingredients_losses_bake":"0"
      }
    ]
  }
}
Copy to clipboardErrorCopied
Метод возвращает свойства товара или тех. карты.

HTTP запрос
GET https://joinposter.com/api/menu.getProduct

GET-параметры запроса menu.getProduct
Параметр	Описание
product_id	ID товара или тех. карты
Параметры ответа menu.getProduct
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит объект, внутри которого есть следующие параметры:

Параметр	Описание
barcode	Штрихкод товара
category_name	Название категории, в которой содержится товар
unit	Единица измерения товара
cost	Себестоимость товара в копейках
cost_netto	Себестоимость товара без НДС в копейках. Возвращается если включена настройка «Считать себестоимость и прибыль нетто»
fiscal	Фискальный признак товара: 0 — нефискальный, 1 — фискальный
menu_category_id	ID категории, в которой содержится товар
workshop	ID цеха товара
nodiscount	Признак, могут ли применяться скидки к этому товару: 0 — не могут, 1 — могут
photo	Фотография товара
product_code	Складская учётная единица товара
product_id	ID товара
product_name	Название товара
sort_order	Порядок сортировки товара
tax_id	ID налога товара
product_tax_id	Признак, что налог товара унаследован от налога категории: 0 — не унаследован, 1 — унаследован
type	Тип товара: 1 — полуфабрикат, 2 — тех.карта, 3 — товар
weight_flag	Признак, что товар весовой: 0 — не весовой, 1 — весовой
color	Цвет карточки товара на кассе
spots	Заведения, в которых доступен товар
sources	Источники заказа, в которых доступен товар
ingredient_id	ID ингредиента (возвращается, если товар)
cooking_time	Время приготовления блюда в секундах
product_production_description	Описание процесса приготовления
fiscal_code	Код УКТ ВЭД. Доступен только для аккаунтов из Украины, использующих фискализацию
out	Сумма нетто всех ингредиентов тех. карты, для товара всегда 0
ingredients	Список ингредиентов (возвращается, если тех. карта)
menu.createProduct: Создание товара
Пример запроса на создание товара без модификаций:

<?php
$url = 'https://joinposter.com/api/menu.createProduct'
  . '?token=687409:4164553abf6a031302898da7800b59fb';

$product = [
    'product_name'           => 'Пончик',
    'menu_category_id'       => 0,
    'workshop'               => 1,
    'weight_flag'            => 0,
    'color'                  => 'red',
    'different_spots_prices' => 0,
    'modifications'          => 0,
    'barcode'                => '4820098749621',
    'cost'                   => 2000,
    'price'                  => 3000,
    'visible'                => 1,
    'fiscal_code'            => 1234567890,
];

$data = sendRequest($url, 'post', $product);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":60
}
Copy to clipboardErrorCopied
Пример запроса на создание товара с модификациями:

<?php
$url = 'https://joinposter.com/api/menu.createProduct'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$product = [
    'product_name'           => 'Sprite',
    'menu_category_id'       => 0,
    'workshop'               => 1,
    'weight_flag'            => 0,
    'color'                  => 'red',
    'different_spots_prices' => 0,
    'modifications'          => 1,
    'modificator_name[0]'    => '1 л.',
    'modificator_name[1]'    => '2 л.',
    'barcode[0]'             => '4820098749621',
    'barcode[1]'             => '4820098749622',
    'product_code[0]'        => '3412356',
    'product_code[1]'        => '3412357',
    'cost[0]'                => 700,
    'cost[1]'                => 1000,
    'price[0]'               => 1500,
    'price[1]'               => 2000,
    'visible[0]'             => 1,
    'visible[1]'             => 1,
    'fiscal_code[0]'         => 1234567890,
    'fiscal_code[1]'         => 1234567891,
];

$data = sendRequest($url, 'post', $product);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":61,
  "modifications_id":[  
    1,
    2
  ]
}
Copy to clipboardErrorCopied
Метод создаёт товар.

HTTP запрос
POST https://joinposter.com/api/menu.createProduct

POST-параметры запроса menu.createProduct
Параметр	Описание
product_name	Название товара
menu_category_id	ID категории меню. Если передать 0, то товар попадет на «Главный экран».
workshop	ID цеха. Обязательное поле для аккаунтов типа «кафе».
weight_flag	Признак, что товар штучный или весовой: 0 — штучный, 1 — весовой
color	Цвет карточки товара: white, red, orange, yellow, green, blue, navy-blue, purple, black, mint-blue, lime-green, pink. По умолчанию принимает white.
different_spots_prices	Признак, что у товара разные цены в разных заведениях: 0 — одинаковые цены, 1 — разные цены
modifications	Признак, что товар с модификаторами: 0 — без модификаторов, 1 — с модификаторами
modificator_name	Название модиикатора. Является обязательным, если в параметре modifications передана 1. Все имена передаются с указанием индекса модификатора в квадратных скобках: modificator_name[0], modificator_name[1] и так далее.
barcode	Штрихкод товара. Позволяет использовать сканер штрих-кодов во время продажи товаров. Для штучных товаров рекомендуется использовать 13-значный код, для весовых товаров рекомендуется использовать 7-значный код. Если товар без модификаторов, то параметр передается как barcode, если с модификаторами, то с указанием индекса модификатора в квадратных скобках: barcode[0], barcode[1] и так далее.
product_code	Артикул товара. Указывается только для аккаунтов типа «магазин». Если товар без модификаторов, то параметр передается как product_code, если с модификаторами, то с указанием индекса модификатора в квадратных скобках: product_code[0], product_code[1] и так далее.
cost	Первичная себестоимость товара в копейках, которая будет использоваться до первой поставки товара. Если товар без модификаторов, то параметр передается как cost, если с модификаторами, то с указанием индекса модификации в квадратных скобках: cost[0], cost[1] и так далее.
price	Стоимость товара в копейках. Если товар без модификаторов, то параметр передаётся как price, если с модификаторами, то с указанием индекса модификаторов в квадратных скобках: price[0], price[1] и так далее. Кроме того, если включается свойство «разные цены в разных заведениях», то добавляется ещё один уровень массива, где будут указываться ID заведений. То есть, price[1], price[2] и так далее — без модификаторов, и price[0][1], price[1][2] — с модификаторами (в качестве индекса сначала индекс модификации, а потом ID заведения).
visible	Признак, что товар виден на терминале в этом заведении: 0 — не виден, 1 — виден. Используется только при включенном свойстве «разные цены в разных заведениях». Структуру передачи данных идентична параметру price. То есть, visible[1], visible[2] и так далее — без модификаторов (ID заведения в качестве индекса), и visible[0][1], visible[1][2] — с модификациями (в качестве индекса сначала индекс модификации, а потом ID заведения).
fiscal_code	Код УКТ ВЭД. Доступен только для аккаунтов из Украины, использующих фискализацию. Необязателен для заполнения
Параметры ответа menu.createProduct без модификаций
Параметр	Описание
response	ID созданного товара
Параметры ответа menu.createProduct с модификациями
Параметр	Описание
product_id	ID созданного товара
modifications_id	Массив из ID модификаций созданного товара
menu.updateProduct: Изменение свойств товара
Пример запроса на изменение данных товара без модификаций и с разными ценами в разных заведениях:

<?php
$url = 'https://joinposter.com/api/menu.updateProduct'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$product = [
    'id'                     => 142,
    'product_name'           => 'Батон',
    'menu_category_id'       => 0,
    'workshop'               => 1,
    'weight_flag'            => 0,
    'color'                  => 'blue',
    'different_spots_prices' => 1,
    'modifications'          => 0,
    'barcode'                => '4820098749621',
    'price[1]'               => 3100,
    'price[2]'               => 3200,
    'visible'                => 1,
    'fiscal_code'            => 1234567890,
];

$data = sendRequest($url, 'post', $product);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response": 142
}
Copy to clipboardErrorCopied
Пример запроса на изменение товара с модификациями:

<?php
$url = 'https://joinposter.com/api/menu.updateProduct'
    . '?token=687409:4164553abf6a031302898da7800b59fb';

$product = [
    'id'                     => 57,
    'product_name'           => 'Имбирный чай',
    'menu_category_id'       => 0,
    'workshop'               => 1,
    'weight_flag'            => 0,
    'color'                  => 'green',
    'different_spots_prices' => 1,
    'modifications'          => 1,
    'modificator_id[0]'      => 1,
    'modificator_id[1]'      => 0,
    'modificator_id[2]'      => 2,
    'modificator_name[0]'    => '1л',
    'modificator_name[1]'    => '1.5л',
    'modificator_name[2]'    => '2л',
    'barcode[0]'             => '4820098749621',
    'barcode[1]'             => '4820098749623',
    'barcode[2]'             => '4820098749622',
    'fiscal_code[0]'         => 1234567890,
    'fiscal_code[1]'         => 1234567891,
    'fiscal_code[2]'         => 1234567892,
    'price[0][1]'            => 1500,
    'price[0][2]'            => 1600,
    'price[1][1]'            => 1700,
    'price[1][2]'            => 1800,
    'price[2][1]'            => 2000,
    'price[2][2]'            => 2100,
    'visible[0][1]'          => 1,
    'visible[0][2]'          => 1,
    'visible[1][1]'          => 1,
    'visible[1][2]'          => 1,
    'visible[2][1]'          => 0,
    'visible[2][2]'          => 0,
];

$data = sendRequest($url, 'post', $product);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":{  
    "product_id":61,
    "modifications_id":[  
      1,
      7,
      2
    ]
  }
}
Copy to clipboardErrorCopied
Метод изменяет свойства товара.

HTTP запрос
POST https://joinposter.com/api/menu.updateProduct

POST-параметры запроса menu.updateProduct
Параметр	Описание
id	ID товара
product_name	Название товара
menu_category_id	ID категории меню. Если передать 0, то товар попадет на «Главный экран».
workshop	ID цеха. Обязательное поле для аккаунтов типа «кафе».
weight_flag	Признак, что товар штучный или весовой: 0 — штучный, 1 — весовой
color	Цвет карточки товара: white, red, orange, yellow, green, blue, navy-blue, purple, black, mint-blue, lime-green, pink. По умолчанию принимает white.
different_spots_prices	Признак, что у товара разные цены в разных заведениях: 0 — одинаковые цены, 1 — разные цены
modifications	Признак, что товар с модификаторами: 0 — без модификаторов, 1 — с модификаторами
modificator_id	ID модиикатора. Является обязательным, если в параметре modifications передана 1. Для существующих модифиторов необходимо передать их существующий modificator_id. Для новых модификаторов необходимо передать 0.
modificator_name	Название модиикатора. Является обязательным, если в параметре modifications передана 1. Все имена передаются с указанием индекса модификатора в квадратных скобках: modificator_name[0], modificator_name[1] и так далее.
barcode	Штрихкод товара. Позволяет использовать сканер штрихкодов во время продажи товаров. Для штучных товаров рекомендуется использовать 13-значный код, для весовых товаров рекомендуется использовать 7-значный код. Если товар без модификаторов, то параметр передается как barcode, если с модификаторами, то с указанием индекса модификатора в квадратных скобках: barcode[0], barcode[1] и так далее.
product_code	Артикул товара. Указывается только для аккаунтов типа «магазин». Если товар без модификаторов, то параметр передается как product_code, если с модификаторами, то с указанием индекса модификатора в квадратных скобках: product_code[0], product_code[1] и так далее.
price	Стоимость товара в копейках. Если товар без модификаторов, то параметр передаётся как price, если с модификаторами, то с указанием индекса модификаторов в квадратных скобках: price[0], price[1] и так далее. Кроме того, если включается свойство «разные цены в разных заведениях», то добавляется ещё один уровень массива, где будут указываться id заведений. То есть, price[1], price[2] и так далее — без модификаторов, и price[0][1], price[1][2] — с модификаторами (в качестве индекса сначала индекс модификации, а потом ID заведения).
visible	Признак, что товар виден на терминале в этом заведении: 0 — не виден, 1 — виден. Используется только при включенном свойстве «разные цены в разных заведениях». Структуру передачи данных идентична параметру price. То есть, visible[1], visible[2] и так далее — без модификаторов (ID заведения в качестве индекса), и visible[0][1], visible[1][2] — с модификациями (в качестве индекса сначала индекс модификации, а потом ID заведения).
fiscal_code	Код УКТ ВЭД. Доступен только для аккаунтов из Украины, использующих фискализацию. Необязателен для заполнения
Параметры ответа menu.updateProduct без модификаций
Параметр	Описание
response	ID изменённого товара
Параметры ответа menu.updateProduct с модификациями
Параметр	Описание
product_id	ID изменённого товара
modifications_id	Массив из ID модификаций изменённого товара
menu.updateProductPrice: Изменение цены товара
Пример запроса на изменение цены товара:

<?php
$url = 'https://joinposter.com/api/menu.updateProductPrice'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$product = [
    'spot_id'          => 1,
    'price'            => '100',
    'product_id'       => 139,
    'modificator_id'   => 0,
];

$data = sendRequest($url, 'post', $product);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "success": 1
}
Copy to clipboardErrorCopied
Метод изменяет цену одного или нескольких товаров.

HTTP POST запрос
POST https://joinposter.com/api/menu.updateProductPrice

POST-параметры запроса menu.updateProductPrice
Параметр	Описание
spot_id	ID заведения, обязтаельный параметр для обновления цены с product_id
price	Стоимость товара в валюте аккаунта, обязательный параметр для обновления цены с product_id
product_id	ID товара, обязательный параметр, если нет массива products
modificator_id	ID модификатора, необязательный параметр
products	Массив товаров с ценами, необязательный параметр
modifications	Массив модификаций товара или модификаторов тех. карт
POST-параметры массива products
Параметр	Описание
id	ID товара
spot_id	ID заведения
price	Стоимость товара
POST-параметры массива modifications
Параметр	Описание
id	ID модификации товара или модификатора тех.карты
spot_id	ID заведения, если это модификатор товара
price	Стоимость модификации
Параметры ответа menu.updateProductPrice без модификаций
Параметр	Описание
success	1 — в случае успешной операции
📝 Изменить документацию

 Previous
Изменить товар
Next 
Удалить товар
menu.removeProduct: Удаление товара
Пример запроса:

<?php
$url = 'https://joinposter.com/api/menu.removeProduct'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$product = [
    'product_id' => 48,
];

$data = sendRequest($url, 'post', $product);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":true
}
Copy to clipboardErrorCopied
Метод удаляет товар.

HTTP запрос
GET https://joinposter.com/api/menu.removeProduct

POST-параметры запроса menu.removeProduct
Параметр	Описание
product_id	ID товара
Параметры ответа menu.removeProduct
Параметр	Описание
response	true, если товар успешно удалён
📝 Изменить документацию

 Previous
Изменить цену товара
Next 
Восстановить товар
menu.recoverProduct: Восстановление товара
Пример запроса
PHP
php
<?php
$url = 'https://joinposter.com/api/menu.recoverProduct'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$product = [
    'product_id' => 48,
    'menu_category_id' => 10,
    'workshop' => 3,
    'tax_id' => 1,
];

$data = sendRequest($url, 'post', $product);
cURL
Пример ответа:

{  
  "response":true
}
Copy to clipboardErrorCopied
Метод восстанавливает товар.

HTTP запрос
POST https://joinposter.com/api/menu.removeProduct

POST-параметры запроса menu.recoverProduct
Параметр	Описание
product_id	ID товара
menu_category	ID категории меню
workshop	ID цеха
tax_id	ID налога
Параметры ответа menu.recoverProduct
Параметр	Описание
response	true, если товар успешно восстановлен
📝 Изменить документацию

 Previous
Удалить товар
Next 
Создать тех. карту
menu.createDish: Создание тех. карты
Пример запроса на создание техкартыы:

<?php
$url = 'https://joinposter.com/api/menu.createDish'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$dish = [
    'product_name' => 'Кальян с сюрпризом',
    'menu_category_id' => 151,
    'different_spots_prices' => 1,
    'workshop' => 4,
    'weight_flag' => 0,
    'product_color' => 'red',
    'nodiscount' => 1,
    'fiscal_code' => 1234567890,
    'price' => [
        1 => 55,
        2 => 57,
    ],
    'visible' => [
        1 => 1,
        2 => 0,
    ],
    "ingredient" => [[
        "id" => 813,
        "type" => 1,
        "unit" => "kg",
        "weight" => 0,
        "stew" => 0,
        "bake" => 0,
        "brutto" => 10,
        "lock" => 1,
        "netto" => 10,
    ]],
    'modificationgroup' => [
        [
            'type'          => 1,
            'minNum'        => 1,
            'maxNum'        => 1,
            'name'          => 'Чаша',
            "modifications" => [
                [
                    "ingredientId" => 820,
                    "type" => 1,
                    "name" => "Классическая чаша",
                    "brutto" => 1,
                    "price" => 500,
                ],
                [
                    "ingredientId" => 816,
                    "name" => "Апельсиновая чаша",
                    "type" => 1,
                    "brutto" => 1,
                    "price" => 400,
                ],
            ]
        ]
    ]
];

$data = sendRequest($url, 'post', $dish);
Copy to clipboardErrorCopied
Пример ответа:

{
  "response":61
}
Copy to clipboardErrorCopied
Метод создаёт тех. карту.

Нельзя создавать тех. карту с модификаторами если она:

весовая, wait_flag — 1
участвует в акциях или находится в категории которая участвует в акции
является элементом тех. карты с модификатором
участвует в списаниях или производствах
HTTP запрос
POST https://joinposter.com/api/menu.createDish

POST-параметры запроса menu.createDish
Параметр	Описание
product_name	Название тех. карты
barcode	Штрихкод тех. карты. По умолчанию не передаётся.
menu_category_id	ID категории тех. карты. По умолчанию принимает 0.
workshop_id	ID цеха. По умолчанию принимает 1.
product_color	Цвет карточки тех. карты: white, red, orange, yellow, green, blue, navy-blue, purple, black, mint-blue, lime-green, pink. По умолчанию принимает white.
weight_flag	Признак, что тех. карта весовая: 0 — не весовая, 1 — весовая. По умолчанию принимает 0. Если в тех. карте присутсвует штучный ингредиент, то она не может быть весовой. Если тех. карта с модификациями не может быть весовой.
nodiscount	Признак, что тех. карта принимает участие в скидках: 0 — не принимает участие, 1 — принимает участие. По умолчанию принимает 1.
price	Массив цен по разным заведениям. Ключ массива — ID заведения, значение — цена в копейках. Можно указать price не массивом, тогда цена раскидается на все заведения.
visible	Массив видимости тех. карты по разным заведениям. Ключ массива — ID заведения. Можно указать visible не массивом, тогда видимость раскидается на все заведения.
ingredient	Массив ингредиентов и полуфабрикатов входящих в состав тех. карты
modificationgroup	Массив групп модификаторов
fiscal_code	Код УКТ ВЭД. Доступен только для аккаунтов из Украины, использующих фискализацию. Необязателен для заполнения
Внутри параметра ingredient лежит объект, внутри которого есть следующие параметры:

Параметр	Описание
id	ID полуфабриката или ингредиента
type	Тип ингредиента: 1 — ингредиент, 2 — полуфабрикат
brutto	Брутто
netto	Нетто
bake	Признак, используется ли метод приготоволения «варка»: 0 — нет, 1 — да. По умолчанию передаётся 0.
cook	Признак, используется ли метод приготоволения «запекание»: 0 — нет, 1 — да. По умолчанию передаётся 0.
clear	Признак, используется ли метод приготоволения «очистка»: 0 — нет, 1 — да. По умолчанию передаётся 0.
fry	Признак, используется ли метод приготоволения «жарка»: 0 — нет, 1 — да. По умолчанию передаётся 0.
stew	Признак, используется ли метод приготоволения «тушение»: 0 — нет, 1 — да. По умолчанию передаётся 0.
lock	Тип зависимости нетто от брутто: 0 — ручная, 1 — автоматическая
Внутри параметра modificationgroup лежит объект, внутри которого есть следующие параметры:

Параметр	Описание
type	Тип набора модификаторов. Сколько модификаторов из набора можно добавить к тех. карте: 1 — только один, 2 — несколько
minNum	Минимальное количество модификаторов, которые нужно выбрать
maxNum	Максимальное количество модификаторов, которые нужно выбрать
name	Имя группы модификаторов
modifications	Массив модификаторов
Внутри параметра modifications лежит объект, внутри которого есть следующие параметры:

Параметр	Описание
ingredientId	ID ингредиента, тех. карты или полуфабриката
type	Тип: 10 - ингредиент, 1 - товар, 2 - тех. карта, 3 - полуфабрикат, 8 - модификатор товара
name	Название модификатора
brutto	Брутто модификатора
price	Дельта добавляемой цены к продукту при добавлении модификации. Цена в копейках и может быть нулевой.
menu.updateDish: Изменение свойств тех. карты
Пример запроса на редактирование техкарты:

<?php
$url = 'https://joinposter.com/api/menu.updateDish'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$dish = [
    'dish_id'                => 171,
    'product_name'           => 'Гамбургер с телятиной',
    'barcode'                => 159687,
    'menu_category_id'       => 10,
    'different_spots_prices' => 1,
    'workshop'               => 2,
    'weight_flag'            => 0,
    'product_color'          => 'red',
    'nodiscount'             => 0,
    'fiscal_code'            => 1234567890,
    'ingredient'             => [
        [
            'id'     => 815,
            'type'   => 1,
            'brutto' => 3,
            'netto'  => 6,
            'lock'   => 1,
            'clear'  => 1,
        ]
    ],
    'price' => [
        1 => 55,
        2 => 57,
    ],
    'visible' => [
        1 => 1,
        2 => 0,
    ],
    'modificationgroup'      => [
        [
            'type'          => 1,
            'minNum'        => 1,
            'maxNum'        => 1,
            'name'          => 'Картофель',
            'modifications' => [
                [
                    'ingredientId' => 814,
                    'type'         => 1,
                    'name'         => 'Вареный картофель',
                    'brutto'       => 200,
                    'price'        => 230,
                ],
                [
                    'ingredientId' => 816,
                    'type'         => 1,
                    'name'         => 'Фри',
                    'brutto'       => 150,
                    'price'        => 280,
                ],
            ],
        ]
    ],
];

$data = sendRequest($url, 'post', $dish);
Copy to clipboardErrorCopied
Пример ответа:

{
  "response":61
}
Copy to clipboardErrorCopied
Метод изменяет свойства тех. карты.

Нельзя создавать тех. карту с модификаторами если она:

весовая, weight_flag — 1
участвует в акциях или находится в категории которая участвует в акции
является элементом тех. карты с модификатором
участвует в списаниях или производствах
HTTP запрос
POST https://joinposter.com/api/menu.updateDish

POST-параметры запроса menu.updateDish
Параметр	Описание
dish_id	ID тех. карты
product_name	Название тех. карты
barcode	Штрихкод тех. карты
menu_category_id	ID категории тех. карты
workshop	ID цеха
product_color	Цвет карточки тех. карты: white, red, orange, yellow, green, blue, navy-blue, purple, black, mint-blue, lime-green, pink
weight_flag	Признак, что тех. карта весовая: 0 — не весовая, 1 — весовая. Если в тех. карте присутсвует штучный ингредиент, то она не может быть весовой.
nodiscount	Признак, что тех. карта принимает участие в скидках: 0 — не принимает участие, 1 — принимает участие
price	Массив цен по разным заведениям. Ключ массива — ID заведения. Можно указать price не массивом, тогда цена раскидается на все заведения.
visible	Массив видимости тех. карты по разным заведениям. Ключ массива — ID заведения. Можно указать visible не массивом, тогда видимость раскидается на все заведения.
ingredient	Массив ингредиентов и полуфабрикатов входящих в состав тех. карты
modificationgroup	Массив групп модификаторов
fiscal_code	Код УКТ ВЭД. Доступен только для аккаунтов из Украины, использующих фискализацию. Необязателен для заполнения
Внутри параметра ingredient лежит объект, внутри которого есть следующие параметры:

Параметр	Описание
id	ID полуфабриката или ингредиента
type	Тип ингредиента: 1 — ингредиент, 2 — полуфабрикат
brutto	Брутто
netto	Нетто
bake	Признак, используется ли метод приготоволения «варка»: 0 — нет, 1 — да. По умолчанию передаётся 0.
cook	Признак, используется ли метод приготоволения «запекание»: 0 — нет, 1 — да. По умолчанию передаётся 0.
clear	Признак, используется ли метод приготоволения «очистка»: 0 — нет, 1 — да. По умолчанию передаётся 0.
fry	Признак, используется ли метод приготоволения «жарка»: 0 — нет, 1 — да. По умолчанию передаётся 0.
stew	Признак, используется ли метод приготоволения «тушение»: 0 — нет, 1 — да. По умолчанию передаётся 0.
lock	Тип зависимости нетто от брутто: 0 — ручная, 1 — автоматическая
Внутри параметра modificationgroup лежит объект, внутри которого есть следующие параметры:

Параметр	Описание
dish_modification_group_id	ID группы которую редактируем. Все группы модификаций продукта, которые не прийдут в запросе, будут удалены.
type	Тип набора модификаторов. Сколько модификаторов из набора можно добавить к тех. карте: 1 — только один, 2 — несколько
minNum	Минимальное количество модификаторов, которые нужно выбрать
maxNum	Максимальное количество модификаторов, которые нужно выбрать
name	Имя группы модификаторов
modifications	Массив модификаторов
Внутри параметра modifications лежит объект, внутри которого есть следующие параметры:

Параметр	Описание
dish_modification_id	ID модификации которую редактируем. Все модификации продукта, которые не прийдут в запросе, будут удалены.
ingredientId	ID ингредиента, тех. карты или полуфабриката
type	Тип: 10 — ингредиент, 1 — товар, 2 - тех. карта 8 - модификатор товара, 3 - полуфабрикат
name	Название модификатора
brutto	Масса брутто модификатора
price	Дельта добавляемой цены к продукту при добавлении модификации. Может быть нулевой.
menu.removeDish: Удаление тех. карты
Пример запроса:

<?php
$url = 'https://joinposter.com/api/menu.removeDish'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$dish = [
    'dish_id' => 925,
];

$data = sendRequest($url, 'post', $dish);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":true
}
Copy to clipboardErrorCopied
Метод удаляет тех. карту.

HTTP запрос
GET https://joinposter.com/api/menu.removeDish

POST-параметры запроса menu.removeDish
Параметр	Описание
dish_id	ID тех. карты
Параметры ответа menu.removeDish
Параметр	Описание
response	true, если тех. карта успешно удалена
📝 Изменить документацию

 Previous
Изменить тех. карту
Next 
Восстановить тех. карту
menu.recoverDish: Восстановление тех. карты
Пример запроса
PHP
php
<?php
$url = 'https://joinposter.com/api/menu.recoverDish'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$product = [
    'product_id' => 48,
    'menu_category_id' => 10,
    'workshop' => 3,
    'tax_id' => 1,
];

$data = sendRequest($url, 'post', $product);
cURL
Пример ответа:

{  
  "response":true
}
Copy to clipboardErrorCopied
Метод восстанавливает тех. карту.

HTTP запрос
POST https://joinposter.com/api/menu.recoverDish

POST-параметры запроса menu.recoverDish
Параметр	Описание
product_id	ID тех. карты
menu_category	ID категории меню
workshop	ID цеха
tax_id	ID налога
Параметры ответа menu.recoverDish
Параметр	Описание
response	true, если тех. карта успешно восстановлена
📝 Изменить документацию

 Previous
Удалить тех. карту
Next 
Получить полуфабрикаты
menu.getPrepacks: Список полуфабрикатов
Пример запроса:

<?php
$url = 'https://joinposter.com/api/menu.getPrepacks'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":[  
    {  
      "product_id":"167",
      "ingredient_id":"0",
      "product_name":"Куринный бульон",
      "cost":"1222",
      "cost_netto":"1018",
      "out":171,
      "product_production_description":"",
      "ingredients":[  
        {  
          "structure_id":"45",
          "ingredient_id":"88",
          "pr_in_clear":"0",
          "pr_in_cook":"1",
          "pr_in_fry":"0",
          "pr_in_stew":"0",
          "pr_in_bake":"0",
          "structure_unit":"kg",
          "structure_type":"1",
          "structure_brutto":200,
          "structure_netto":170,
          "structure_lock":"1",
          "structure_selfprice":"1221",
          "structure_selfprice_netto":"1018",
          "ingredient_name":"Куриные крылья",
          "ingredient_unit":"kg",
          "ingredient_weight":"0",
          "ingredients_losses_clear":"0",
          "ingredients_losses_cook":"15",
          "ingredients_losses_fry":"16",
          "ingredients_losses_stew":"16",
          "ingredients_losses_bake":"16"
        },
        {  
          "structure_id":"46",
          "ingredient_id":"89",
          "pr_in_clear":"0",
          "pr_in_cook":"0",
          "pr_in_fry":"0",
          "pr_in_stew":"0",
          "pr_in_bake":"0",
          "structure_unit":"kg",
          "structure_type":"1",
          "structure_brutto":1,
          "structure_netto":1,
          "structure_lock":"1",
          "structure_selfprice":"1",
          "structure_selfprice_netto":"1",
          "ingredient_name":"Соль",
          "ingredient_unit":"kg",
          "ingredient_weight":"0",
          "ingredients_losses_clear":"0",
          "ingredients_losses_cook":"0",
          "ingredients_losses_fry":"0",
          "ingredients_losses_stew":"0",
          "ingredients_losses_bake":"0"
        }
      ]
    }
  ]
}
Copy to clipboardErrorCopied
Метод возвращает список полуфабрикатов.

HTTP запрос
GET https://joinposter.com/api/menu.getPrepacks

GET-параметры запроса menu.getPrepacks
Параметр	Описание
token	Авторизационный токен
format	Опциональный параметр, указывающий формат выдачи ответа. Может быть xml или json. По умолчанию json.
1c	Опциональный параметр, если значение true — возвращает в ответе ID категории товаров в системе 1С. По умолчанию не передаётся.
Параметры ответа menu.getPrepacks
Параметр	Описание
response	Массив объектов
Внутри параметра response лежит массив, в каждом элементе которого есть следующие параметры:

Параметр	Описание
product_id	ID полуфабриката в таблице товаров
ingredient_id	ID полуфабриката в таблице ингредиентов, если полуфабрикат производимый, иначе принимает 0
product_name	Название полуфабриката
cost	Себестоимость полуфабриката
cost_netto	Себестоимость полуфабриката без НДС. Возвращается если включена настройка «Считать себестоимость и прибыль нетто»
out	Вес полуфабриката
product_production_description	Описание процесса приготовления
id_1c	ID полуфабриката в системе 1С
ingredients	Ингредиенты, входящие в состав полуфабриката
Внутри параметра ingredients лежит объект, внутри которого есть следующие параметры:

Параметр	Описание
structure_id	ID элемента полуфабриката
ingredient_id	ID ингредиента
pr_in_clear	Признак, что используется метод приготовления «очистка»: 0 — не используется, 1 — используется
pr_in_cook	Признак, что используется метод приготовления «запекание»: 0 — не используется, 1 — используется
pr_in_fry	Признак, что используется метод приготовления «жарка»: 0 — не используется, 1 — используется
pr_in_stew	Признак, что используется метод приготовления «тущение»: 0 — не используется, 1 — используется
pr_in_bake	Признак, что используется метод приготовления «варка»: 0 — не используется, 1 — используется
structure_unit	Единица измерения элемента полуфабриката
structure_type	Тип элемента полуфабриката: 1 — ингредиент, 2 — полуфабрикат
structure_brutto	Брутто элемента полуфабриката
structure_netto	Нетто элемента полуфабриката
structure_lock	Зависимость нетто от брутто: 0 — ручная, 1 — автоматическая
structure_selfprice	Цена элемента полуфабриката
structure_selfprice_netto	Цена элемента полуфабриката без НДС. Возвращается если включена настройка «Считать себестоимость и прибыль нетто»
ingredient_name	Название ингредиента
ingredient_unit	Единица измерения ингредиента: kg — килограммы, p — штуки, l — литры
ingredient_weight	Вес ингредиента, если ингредиент штучный
ingredients_losses_clear	Коэффициент потерь при очистке ингредиента
ingredients_losses_cook	Коэффициент потерь при запекании ингредиента
ingredients_losses_fry	Коэффициент потерь при жарке ингредиента
ingredients_losses_stew	Коэффициент потерь при тущении ингредиента
ingredients_losses_bake	Коэффициент потерь при варке ингредиента
📝 Изменить документацию

 Previous
Восстановить тех. карту
Next 
Получить полуфабрикат
menu.getPrepack: Свойства полуфабриката
Пример запроса:

<?php
$url = 'https://joinposter.com/api/menu.getPrepack'
 . '?token=687409:4164553abf6a031302898da7800b59fb'
 . '&product_id=167'
 . '&1c=true';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":{  
    "product_id":"167",
    "ingredient_id":"0",
    "product_name":"Куринный бульон",
    "cost":"1222",
    "cost_netto":"1018",
    "out":171,
    "product_production_description":"",
    "id_1c":"0",
    "ingredients":[  
      {  
        "structure_id":"45",
        "ingredient_id":"88",
        "pr_in_clear":"0",
        "pr_in_cook":"1",
        "pr_in_fry":"0",
        "pr_in_stew":"0",
        "pr_in_bake":"0",
        "structure_unit":"kg",
        "structure_type":"1",
        "structure_brutto":200,
        "structure_netto":170,
        "structure_lock":"1",
        "structure_selfprice":"1221",
        "structure_selfprice_netto":"1018",
        "ingredient_name":"Куриные крылья",
        "ingredient_unit":"kg",
        "ingredient_weight":"0",
        "ingredients_losses_clear":"0",
        "ingredients_losses_cook":"15",
        "ingredients_losses_fry":"16",
        "ingredients_losses_stew":"16",
        "ingredients_losses_bake":"16"
      },
      {  
        "structure_id":"46",
        "ingredient_id":"89",
        "pr_in_clear":"0",
        "pr_in_cook":"0",
        "pr_in_fry":"0",
        "pr_in_stew":"0",
        "pr_in_bake":"0",
        "structure_unit":"kg",
        "structure_type":"1",
        "structure_brutto":1,
        "structure_netto":1,
        "structure_lock":"1",
        "structure_selfprice":"1",
        "structure_selfprice_netto":"1",
        "ingredient_name":"Соль",
        "ingredient_unit":"kg",
        "ingredient_weight":"0",
        "ingredients_losses_clear":"0",
        "ingredients_losses_cook":"0",
        "ingredients_losses_fry":"0",
        "ingredients_losses_stew":"0",
        "ingredients_losses_bake":"0"
      }
    ]
  }
}
Copy to clipboardErrorCopied
Метод возвращает свойства полуфабриката.

HTTP запрос
GET https://joinposter.com/api/menu.getPrepack

Выполнить в браузере

GET-параметры запроса menu.getPrepack
Параметр	Описание
product_id	ID полуфабриката
1c	Опциональный параметр, если значение true — возвращает в ответе ID категории товаров в системе 1С. По умолчанию не передаётся.
Параметры ответа menu.getPrepack
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит объект, внутри которого есть следующие параметры:

Параметр	Описание
product_id	ID полуфабриката в таблице товаров
ingredient_id	ID полуфабриката в таблице ингредиентов, если полуфабрикат производимый, иначе принимает 0
product_name	Название полуфабриката
cost	Себестоимость полуфабриката
cost_netto	Себестоимость полуфабриката без НДС. Возвращается если включена настройка «Считать себестоимость и прибыль нетто»
out	Вес полуфабриката
product_production_description	Описание процесса приготовления
id_1c	ID полуфабриката в системе 1С
ingredients	Ингредиенты, входящие в состав полуфабриката
Внутри параметра ingredients лежит объект, внутри которого есть следующие параметры:

Параметр	Описание
structure_id	ID элемента полуфабриката
ingredient_id	ID ингредиента
pr_in_clear	Признак, что используется метод приготовления «очистка»: 0 — не используется, 1 — используется
pr_in_cook	Признак, что используется метод приготовления «запекание»: 0 — не используется, 1 — используется
pr_in_fry	Признак, что используется метод приготовления «жарка»: 0 — не используется, 1 — используется
pr_in_stew	Признак, что используется метод приготовления «тущение»: 0 — не используется, 1 — используется
pr_in_bake	Признак, что используется метод приготовления «варка»: 0 — не используется, 1 — используется
structure_unit	Единица измерения элемента полуфабриката
structure_type	Тип элемента полуфабриката: 1 — ингредиент, 2 — полуфабрикат
structure_brutto	Брутто элемента полуфабриката
structure_netto	Нетто элемента полуфабриката
structure_lock	Зависимость нетто от брутто: 0 — ручная, 1 — автоматическая
structure_selfprice	Цена элемента полуфабриката в копейках
structure_selfprice_netto	Цена элемента полуфабриката без НДС в копейках. Возвращается если включена настройка «Считать себестоимость и прибыль нетто»
ingredient_name	Название ингредиента
ingredient_unit	Единица измерения ингредиента: kg — килограммы, p — штуки, l — литры
ingredient_weight	Вес ингредиента, если ингредиент штучный
ingredients_losses_clear	Коэффициент потерь при очистке ингредиента
ingredients_losses_cook	Коэффициент потерь при запекании ингредиента
ingredients_losses_fry	Коэффициент потерь при жарке ингредиента
ingredients_losses_stew	Коэффициент потерь при тущении ингредиента
ingredients_losses_bake	Коэффициент потерь при варке ингредиента
📝 Изменить документацию

menu.createPrepack: Создание полуфабриката
Пример запроса:

<?php
$url = 'https://joinposter.com/api/menu.createPrepack'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$prepack = [
    'product_name' => 'Маринованные грибы',
    'ingredient'   => [
        [
            'id'     => 88,
            'type'   => 1,
            'brutto' => 3,
            'netto'  => 6,
            'lock'   => 0,
            'clear'  => 0,
            'cook'   => 0,
            'fry'    => 0,
            'stew'   => 1,
            'bake'   => 0,
        ],
    ],
];

$data = sendRequest($url, 'post', $prepack);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":177
}
Copy to clipboardErrorCopied
Метод создаёт полуфабрикат.

HTTP запрос
GET https://joinposter.com/api/menu.createPrepack

POST-параметры запроса menu.createDish
Параметр	Описание
product_name	Название полуфабриката. Должно быть уникальным.
ingredient	Ингредиенты, входящие в состав полуфабриката
product_production_description	Опциональный параметр, описание процесса приготовления.
Внутри параметра ingredients лежит массив, в каждом элементе которого есть следующие параметры:

Параметр	Описание
id	ID ингредиента или полуфабриката
type	Тип элемента полуфабриката: 1 — ингредиент, 2 — полуфабрикат
brutto	Брутто элемента полуфабриката
netto	Нетто элемента полуфабриката
lock	Зависимость нетто от брутто: 0 — ручная, 1 — автоматическая
clear	Признак, что используется метод приготовления «очистка»: 0 — не используется, 1 — используется. По умолчанию принимает 0.
cook	Признак, что используется метод приготовления «запекание»: 0 — не используется, 1 — используется. По умолчанию принимает 0.
fry	Признак, что используется метод приготовления «жарка»: 0 — не используется, 1 — используется. По умолчанию принимает 0.
stew	Признак, что используется метод приготовления «тущение»: 0 — не используется, 1 — используется. По умолчанию принимает 0.
bake	Признак, что используется метод приготовления «варка»: 0 — не используется, 1 — используется. По умолчанию принимает 0.
Параметры ответа menu.createPrepack
Параметр	Описание
response	ID созданного полуфабриката в таблице товаров
📝 Изменить документацию

 Previous
Получить полуфабрикат
Next 
Изменить полуфабрикат
menu.updatePrepack: Изменение свойств полуфабриката
Пример запроса:

<?php
$url = 'https://joinposter.com/api/menu.updatePrepack'
    . '?token=687409:4164553abf6a031302898da7800b59fb';

$prepack = [
    'prepack_id' => 919,
    'product_name' => 'Блины',
    'ingredient'   => [
        [
            'id'     => 88,
            'type'   => 1,
            'brutto' => 3,
            'netto'  => 6,
            'lock'   => 0,
            'clear'  => 0,
            'cook'   => 0,
            'fry'    => 0,
            'stew'   => 1,
            'bake'   => 0,
        ],
    ],
];

$data = sendRequest($url, 'post', $prepack);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response": 919
}
Copy to clipboardErrorCopied
Метод изменяет свойства полуфабриката.

HTTP запрос
GET https://joinposter.com/api/menu.updatePrepack

POST-параметры запроса menu.updatePrepack
Параметр	Описание
prepack_id	ID полуфабриката
product_name	Название полуфабриката
product_production_description	Описание процесса приготовления
ingredient	Ингредиенты, входящие в состав полуфабриката
Внутри параметра ingredients лежит массив, в каждом элементе которого есть следующие параметры:

Параметр	Описание
id	ID ингредиента или полуфабриката
type	Тип элемента полуфабриката: 1 — ингредиент, 2 — полуфабрикат
brutto	Брутто элемента полуфабриката
netto	Нетто элемента полуфабриката
lock	Зависимость нетто от брутто: 0 — ручная, 1 — автоматическая
clear	Признак, что используется метод приготовления «очистка»: 0 — не используется, 1 — используется. По умолчанию принимает 0.
cook	Признак, что используется метод приготовления «запекание»: 0 — не используется, 1 — используется. По умолчанию принимает 0.
fry	Признак, что используется метод приготовления «жарка»: 0 — не используется, 1 — используется. По умолчанию принимает 0.
stew	Признак, что используется метод приготовления «тущение»: 0 — не используется, 1 — используется. По умолчанию принимает 0.
bake	Признак, что используется метод приготовления «варка»: 0 — не используется, 1 — используется. По умолчанию принимает 0.
Параметры ответа menu.updatePrepack
Параметр	Описание
response	ID изменённого полуфабриката в таблице товаров
📝 Изменить документацию

 Previous
Создать полуфабрикат
Next 
Удалить полуфабрикат
menu.removePrepack: Удаление полуфабриката
Пример запроса:

<?php
$url = 'https://joinposter.com/api/menu.removePrepack'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$prepack = [
    'prepack_id' => 177,
];

$data = sendRequest($url, 'post', $prepack);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":true
}
Copy to clipboardErrorCopied
Метод удаляет полуфабрикат.

HTTP запрос
GET https://joinposter.com/api/menu.removePrepack

POST-параметры запроса menu.removePrepack
Параметр	Описание
prepack_id	ID полуфабриката
Параметры ответа menu.removePrepack
Параметр	Описание
response	true, если полуфабрикат успешно удалён
📝 Изменить документацию

 Previous
Изменить полуфабрикат
Next 
Получить ингредиенты
menu.getIngredients: Список ингредиентов
Пример запроса:

<?php
$url = 'https://joinposter.com/api/menu.getIngredients'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":[  
    {  
      "ingredient_id":"91",
      "ingredient_name":"Jack Daniels",
      "ingredient_barcode": "",
      "category_id":"3",
      "ingredient_left":"443.45000",
      "limit_value":"0",
      "time_notif":"0",
      "ingredient_unit":"l",
      "ingredient_weight":0,
      "ingredients_losses_clear":"0",
      "ingredients_losses_cook":"0",
      "ingredients_losses_fry":"0",
      "ingredients_losses_stew":"0",
      "ingredients_losses_bake":"0",
      "ingredients_type":"1",
      "partial_write_off":"0"
    },
    {  
      "ingredient_id":"73",
      "ingredient_name":"Авокадо",
      "ingredient_barcode": "",
      "category_id":"0",
      "ingredient_left":"22.00000",
      "limit_value":"0",
      "time_notif":"0",
      "ingredient_unit":"kg",
      "ingredient_weight":0,
      "ingredients_losses_clear":"11",
      "ingredients_losses_cook":"0",
      "ingredients_losses_fry":"0",
      "ingredients_losses_stew":"0",
      "ingredients_losses_bake":"0",
      "ingredients_type":"1",
      "partial_write_off":"0"
    },
    {  
      "ingredient_id":"74",
      "ingredient_name":"Айсберг с-т",
      "ingredient_barcode": "",
      "category_id":"0",
      "ingredient_left":"379.09000",
      "limit_value":"0",
      "time_notif":"0",
      "ingredient_unit":"kg",
      "ingredient_weight":0,
      "ingredients_losses_clear":"10",
      "ingredients_losses_cook":"0",
      "ingredients_losses_fry":"0",
      "ingredients_losses_stew":"0",
      "ingredients_losses_bake":"0",
      "ingredients_type":"1",
      "partial_write_off":"0"
    }
  ]
}
Copy to clipboardErrorCopied
Метод возвращает список ингредиентов.

HTTP запрос
GET https://joinposter.com/api/menu.getIngredients

GET-параметры запроса menu.getIngredients
Параметр	Описание
id_1c	Опциональный параметр, если значение true — возвращает в ответе ID категории товаров в системе 1С. По умолчанию не передаётся.
Параметры ответа menu.getIngredients
Параметр	Описание
response	Массив объектов
Внутри параметра response лежит массив, в каждом элементе которого есть следующие параметры:

Параметр	Описание
ingredient_id	ID ингредиента
ingredient_name	Название ингредиента
category_id	ID категории в которой находится ингредиент
ingredient_left	Остаток по ингредиенту
limit_value	Лимит по ингредиенту на складе
time_notif	Время последнего уведомления о достижения лимита по ингредиенту на складе
ingredient_unit	Единица измерения ингредиента: kg — килограммы, p — штуки, l — литры
ingredient_weight	Вес ингредиента, если ингредиент штучный
ingredients_losses_clear	Коэффициент потерь при очистке ингредиента, если ингредиент не штучный
ingredients_losses_cook	Коэффициент потерь при запекании ингредиента, если ингредиент не штучный
ingredients_losses_fry	Коэффициент потерь при жарке ингредиента, если ингредиент не штучный
ingredients_losses_stew	Коэффициент потерь при тущении ингредиента, если ингредиент не штучный
ingredients_losses_bake	Коэффициент потерь при варке ингредиента, если ингредиент не штучный
ingredients_type	Тип ингредиента: 1 — ингредиент, 2 — системный ингредиент
partial_write_off	Можно ли списать дробную часть штучного ингредиента: 0 — нельзя, 1 — можно
id_1c	ID ингредиента в системе 1С
delete	Признак, что ингредиент удалён: 0 — не удалён, 1 — удалён
hidden	Признак, что ингредиент скрыт: 0 — не скрыт, 1 — скрыт
📝 Изменить документацию

 Previous
Удалить полуфабрикат
Next 
Получить ингредиент
menu.getIngredient: Свойства ингредиента
Пример запроса:

<?php
$url = 'https://joinposter.com/api/menu.getIngredient'
 . '?token=687409:4164553abf6a031302898da7800b59fb'
 . '&ingredient_id=91'
 . '&1c=true';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":{  
    "ingredient_id":"91",
    "ingredient_name":"Jack Daniels",
    "ingredient_barcode": "",
    "category_id":"3",
    "ingredient_left":"442.85000",
    "limit_value":"0",
    "time_notif":"0",
    "ingredient_unit":"l",
    "ingredient_weight":0,
    "ingredients_losses_clear":"0",
    "ingredients_losses_cook":"0",
    "ingredients_losses_fry":"0",
    "ingredients_losses_stew":"0",
    "ingredients_losses_bake":"0",
    "ingredients_type":"1",
    "partial_write_off":"0",
    "id_1c":"d70b49a7-0097-11e6-9c83-028037ec0200",
    "delete":"0",
    "hidden":"0"
  }
}
Copy to clipboardErrorCopied
Метод возвращает свойства ингредиента.

HTTP запрос
GET https://joinposter.com/api/menu.getIngredient

GET-параметры запроса menu.getIngredient
Параметр	Описание
ingredient_id	ID ингредиента
1c	Опциональный параметр, если значение true — возвращает в ответе ID категории товаров в системе 1С. По умолчанию не передаётся.
Параметры ответа menu.getIngredient
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит объект, внутри которого есть следующие параметры:

Параметр	Описание
ingredient_id	ID ингредиента
ingredient_name	Название ингредиента
category_id	ID категории в которой находится ингредиент
ingredient_left	Остаток по ингредиенту
limit_value	Лимит по ингредиенту на складе
time_notif	Время последнего уведомления о достижения лимита по ингредиенту на складе
ingredient_unit	Единица измерения ингредиента: kg — килограммы, p — штуки, l — литры
ingredient_weight	Вес ингредиента, если ингредиент штучный
ingredients_losses_clear	Коэффициент потерь при очистке ингредиента, если ингредиент не штучный
ingredients_losses_cook	Коэффициент потерь при запекании ингредиента, если ингредиент не штучный
ingredients_losses_fry	Коэффициент потерь при жарке ингредиента, если ингредиент не штучный
ingredients_losses_stew	Коэффициент потерь при тущении ингредиента, если ингредиент не штучный
ingredients_losses_bake	Коэффициент потерь при варке ингредиента, если ингредиент не штучный
ingredients_type	Тип ингредиента: 1 — ингредиент, 2 — системный ингредиент
partial_write_off	Можно ли списать дробную часть штучного ингредиента: 0 — нельзя, 1 — можно
id_1c	ID ингредиента в системе 1С
delete	Признак, что ингредиент удалён: 0 — не удалён, 1 — удалён
hidden	Признак, что ингредиент скрыт: 0 — не скрыт, 1 — скрыт
📝 Изменить документацию

 Previous
Получить ингредиенты
Next 
Создать ингредиенты
menu.createIngredients: Групповое создание ингредиентов
Пример запроса
PHP
php
<?php
$url = 'https://joinposter.com/api/menu.createIngredients'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$ingredients = [
    [
        'ingredient_name' => 'Яблоко',
        'type'            => 'p',
    ],
    [
        'ingredient_name' => 'Груша',
        'type'            => 'p',
    ]
];

$data = sendRequest($url, 'post', $ingredients);
Postman
Пример ответа:

{
  "response": [
    7,
    8
  ]
}
Copy to clipboardErrorCopied
Метод создаёт несколько ингредиентов за один запрос.

HTTP запрос
POST https://joinposter.com/api/menu.createIngredients

POST-параметры запроса menu.createIngredients
Параметр	Описание
ingredient_name	Название ингредиента
category_id	ID категории ингредиента
type	Единица измерения ингредиента: kg — килограммы, p — штуки, l — литры
ingredient_barcode	Штрихкод ингредиента
weight_ingredient	Вес ингредиента, если ингредиент штучный
loss_clear	Коэффициент потерь при очистке ингредиента, если ингредиент не штучный
loss_cook	Коэффициент потерь при запекании ингредиента, если ингредиент не штучный
loss_fry	Коэффициент потерь при жарке ингредиента, если ингредиент не штучный
loss_stew	Коэффициент потерь при тущении ингредиента, если ингредиент не штучный
loss_bake	Коэффициент потерь при варке ингредиента, если ингредиент не штучный
partial_write_off	Признак, что можно списывать штучный ингредиент, как дробный: 0 — нельзя, 1 — можно
Параметры ответа menu.createIngredients
Параметр	Описание
response	Массив ID добавленных ингредиентов
📝 Изменить документацию

 Previous
Получить ингредиент
Next 
Создать ингредиент
    menu.createIngredient: Создание ингредиента
Пример запроса
PHP
php
<?php
$url = 'https://joinposter.com/api/menu.createIngredient'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$ingredient = [
    'ingredient_name'   => 'Клубника',
    'category_id'       => 4,
    'type'              => 'p',
    'weight_ingredient' => 200,
];

$data = sendRequest($url, 'post', $ingredient);
Postman
Пример ответа:

{  
  "response":811
}
Copy to clipboardErrorCopied
Метод создаёт ингредиент.

HTTP запрос
POST https://joinposter.com/api/menu.createIngredient

POST-параметры запроса menu.createIngredient
Параметр	Описание
ingredient_name	Название ингредиента
category_id	ID категории ингредиента
type	Единица измерения ингредиента: kg — килограммы, p — штуки, l — литры
ingredient_barcode	Штрихкод ингредиента
weight_ingredient	Вес ингредиента, если ингредиент штучный
loss_clear	Коэффициент потерь при очистке ингредиента, если ингредиент не штучный
loss_cook	Коэффициент потерь при запекании ингредиента, если ингредиент не штучный
loss_fry	Коэффициент потерь при жарке ингредиента, если ингредиент не штучный
loss_stew	Коэффициент потерь при тущении ингредиента, если ингредиент не штучный
loss_bake	Коэффициент потерь при варке ингредиента, если ингредиент не штучный
partial_write_off	Признак, что можно списывать штучный ингредиент, как дробный: 0 — нельзя, 1 — можно
Параметры ответа menu.createIngredient
Параметр	Описание
response	ID созданного ингредиента
📝 Изменить документацию

 Previous
Создать ингредиенты
Next 
Изменить ингредиенты
menu.updateIngredients: Групповое изменение ингредиентов
Пример запроса:

<?php
$url = 'https://joinposter.com/api/menu.updateIngredients'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$ingredients = [
    [
        'id'              => '7',
        'ingredient_name' => 'Яблоко',
        'type'            => 'p',
    ],
    [
        'id'              => '8',
        'ingredient_name' => 'Груша',
        'type'            => 'p',
    ]
];

$data = sendRequest($url, 'post', $ingredients);
Copy to clipboardErrorCopied
Пример запроса:

[
  {
    "id": 7,
    "ingredient_name": "Яблоко",
    "type": "p"
  },
  {
    "id": 8,
    "ingredient_name": "Груша",
    "type": "p"
  }
]
Copy to clipboardErrorCopied
Пример ответа:

{
  "response": [
    7,
    8
  ]
}
Copy to clipboardErrorCopied
Метод изменяет несколько ингредиентов за один запрос.

HTTP запрос
POST https://joinposter.com/api/menu.updateIngredients

POST-параметры запроса menu.updateIngredients
Параметр	Описание
id	ID ингредиента
ingredient_name	Название ингредиента
category_id	ID категории ингредиента
type	Единица измерения ингредиента: kg — килограммы, p — штуки, l — литры
ingredient_barcode	Штрихкод ингредиента
weight_ingredient	Вес ингредиента, если ингредиент штучный
loss_clear	Коэффициент потерь при очистке ингредиента, если ингредиент не штучный
loss_cook	Коэффициент потерь при запекании ингредиента, если ингредиент не штучный
loss_fry	Коэффициент потерь при жарке ингредиента, если ингредиент не штучный
loss_stew	Коэффициент потерь при тущении ингредиента, если ингредиент не штучный
loss_bake	Коэффициент потерь при варке ингредиента, если ингредиент не штучный
partial_write_off	Признак, что можно списывать штучный ингредиент, как дробный: 0 — нельзя, 1 — можно
Параметры ответа menu.updateIngredients
Параметр	Описание
response	Массив ID изменённых ингредиентов
📝 Изменить документацию

 Previous
Создать ингредиент
Next 
Изменить ингредиент
menu.updateIngredient: Изменение свойств ингредиента
Пример запроса:

<?php
$url = 'https://joinposter.com/api/menu.updateIngredient'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$ingredient = [
    'id'                => 811,
    'ingredient_name'   => 'Лимон',
    'category_id'       => 4,
    'type'              => 'p',
    'weight_ingredient' => 150,
];

$data = sendRequest($url, 'post', $ingredient);
Copy to clipboardErrorCopied
Пример запроса:

{
  "id": 811,
  "ingredient_name": "Лимон",
  "category_id": 4,
  "type": "p",
  "weight_ingredient": 150
}
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response": 811
}
Copy to clipboardErrorCopied
Метод изменяет свойства ингредиента.

HTTP запрос
GET https://joinposter.com/api/menu.updateIngredient

POST-параметры запроса menu.updateIngredient
Параметр	Описание
id	ID ингредиента
ingredient_name	Название ингредиента
category_id	ID категории ингредиента
ingredient_barcode	Штрихкод ингредиента
type	Единица измерения ингредиента: kg — килограммы, p — штуки, l — литры. Нельзя менять единицу измерения ингредиента, если он уже поставлялся на склад.
weight_ingredient	Вес ингредиента, если ингредиент штучный
loss_clear	Коэффициент потерь при очистке ингредиента, если ингредиент не штучный
loss_cook	Коэффициент потерь при запекании ингредиента, если ингредиент не штучный
loss_fry	Коэффициент потерь при жарке ингредиента, если ингредиент не штучный
loss_stew	Коэффициент потерь при тущении ингредиента, если ингредиент не штучный
loss_bake	Коэффициент потерь при варке ингредиента, если ингредиент не штучный
partial_write_off	Признак, что можно списывать штучный ингредиент, как дробный: 0 — нельзя, 1 — можно
Параметры ответа menu.updateIngredient
Параметр	Описание
response	ID изменённого ингредиента
📝 Изменить документацию

 Previous
Изменить ингредиенты
Next 
Удалить ингредиент
menu.removeIngredient: Удаление ингредиета
Пример запроса:

<?php
$url = 'https://joinposter.com/api/menu.removeIngredient'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$ingredient = [
    'ingredient_id' => 811,
];

$data = sendRequest($url, 'post', $ingredient);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":true
}
Copy to clipboardErrorCopied
Метод удаляет ингредиет.

HTTP запрос
GET https://joinposter.com/api/menu.removeIngredient

POST-параметры запроса menu.removeIngredient
Параметр	Описание
ingredient_id	ID ингредиета
Параметры ответа menu.removeIngredient
Параметр	Описание
response	true, если ингредиет успешно удалён
📝 Изменить документацию

 Previous
Изменить ингредиент
Next 
Получить категории ингредиентов
menu.getCategoriesIngredients: Список категорий ингредиентов
Пример запроса:

<?php
$url = 'https://joinposter.com/api/menu.getCategoriesIngredients'
 . '?token=687409:4164553abf6a031302898da7800b59fb'
 . '&1c=true';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":[  
    {  
      "category_id":"3",
      "name":"Алкоголь",
      "id_1c":"b80ffc81-0fc9-11e7-9ab4-ace01035e460"
    },
    {  
      "category_id":"2",
      "name":"Мясо",
      "id_1c":null
    },
    {  
      "category_id":"1",
      "name":"Овощи",
      "id_1c":null
    },
    {  
      "category_id":"4",
      "name":"Фрукты",
      "id_1c":null
    }
  ]
}
Copy to clipboardErrorCopied
Метод возвращает список категорий ингредиентов.

HTTP запрос
GET https://joinposter.com/api/menu.getCategoriesIngredients

GET-параметры запроса menu.getCategoriesIngredients
Параметр	Описание
1c	Опциональный параметр, если значение true — возвращает в ответе ID категории товаров в системе 1С. По умолчанию не передаётся.
Параметры ответа menu.getCategoriesIngredients
Параметр	Описание
response	Массив объектов
Внутри параметра response лежит массив, в каждом элементе которого есть следующие параметры:

Параметр	Описание
category_id	ID категории ингредиентов
category_name	Название категории ингредиентов
id_1c	ID категории ингредиентов в системе 1С
📝 Изменить документацию

 Previous
Удалить ингредиент
Next 
Получить категорию ингредиентов
menu.getCategoryIngredients: Свойства категории ингредиентов
Пример запроса:

<?php
$url = 'https://joinposter.com/api/menu.getCategoryIngredients'
 . '?token=687409:4164553abf6a031302898da7800b59fb'
 . '&category_id=3'
 . '&1c=true';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":{  
    "category_id":"3",
    "name":"Алкоголь",
    "id_1c":"b80ffc81-0fc9-11e7-9ab4-ace01035e460"
  }
}
Copy to clipboardErrorCopied
Метод возвращает свойства категории ингредиентов.

HTTP запрос
GET https://joinposter.com/api/menu.getCategoryIngredients

GET-параметры запроса menu.getCategoryIngredients
Параметр	Описание
category_id	ID категории ингредиентов
1c	Опциональный параметр, если значение true — возвращает в ответе ID категории товаров в системе 1С. По умолчанию не передаётся.
Параметры ответа menu.getCategoryIngredients
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит объект, внутри которого есть следующие параметры:

Параметр	Описание
category_id	ID категории ингредиентов
category_name	Название категории ингредиентов
id_1c	ID категории ингредиентов в системе 1С
📝 Изменить документацию

 Previous
Получить категории ингредиентов
Next 
Создать категории ингредиентов
menu.createCategoryIngredients: Создание категории ингредиентов
Пример запроса:

<?php
$url = 'https://joinposter.com/api/menu.createCategoryIngredients'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$category_ingredients = [
    'category_name' => 'Овощи',
];

$data = sendRequest($url, 'post', $category_ingredients);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":27
}
Copy to clipboardErrorCopied
Метод создаёт категорию ингредиентов.

HTTP запрос
POST https://joinposter.com/api/menu.createCategoryIngredients

POST-параметры запроса menu.createCategoryIngredients
Параметр	Описание
category_name	Название категории ингредиентов
Параметры ответа menu.createCategoryIngredients
Параметр	Описание
response	ID созданной категории ингредиентов
📝 Изменить документацию

 Previous
Получить категорию ингредиентов
Next 
Изменить категории ингредиентов
menu.updateCategoryIngredients: Изменение свойств категории ингредиентов
Пример запроса:

<?php
$url = 'https://joinposter.com/api/menu.updateCategoryIngredients'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$category_ingredients = [
    'category_id'   => 2,
    'category_name' => 'Фрукты',
];

$data = sendRequest($url, 'post', $category_ingredients);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response": 2
}
Copy to clipboardErrorCopied
Метод изменяет свойства категории ингредиентов.

HTTP запрос
GET https://joinposter.com/api/menu.updateCategoryIngredients

POST-параметры запроса menu.updateCategoryIngredients
Параметр	Описание
category_id	ID категории ингредиентов
category_name	Новое название категории ингредиентов
Параметры ответа menu.updateCategoryIngredients
Параметр	Описание
response	ID изменённой категории ингредиентов
📝 Изменить документацию

 Previous
Создать категории ингредиентов
Next 
Удалить категорию ингредиентов
menu.removeCategoryIngredients: Удаление категории ингредиентов
Пример запроса:

<?php
$url = 'https://joinposter.com/api/menu.removeCategoryIngredients'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$category_ingredients = [
    'category_id'      => 2,
    'with_ingredients' => 1,
];

$data = sendRequest($url, 'post', $category_ingredients);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "success":"successful delete category"
}
Copy to clipboardErrorCopied
Метод удаляет категорию ингредиентов.

HTTP запрос
GET https://joinposter.com/api/menu.removeCategoryIngredients

POST-параметры запроса menu.removeCategoryIngredients
Параметр	Описание
category_id	ID категории ингредиентов
with_ingredients	Признак, удалять ли ингредиенты в категории: 0 — не удалять, 1 — удалять. По умолчанию принимает 0.
Параметры ответа menu.removeCategoryIngredients
Параметр	Описание
success	Сообщение об успешном удалении
📝 Изменить документацию

 Previous
Изменить категории ингредиентов
Next 
Получить цеха
menu.getWorkshops: Список цехов
Пример запроса:

<?php
$url = 'https://joinposter.com/api/menu.getWorkshops'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":[  
    {  
      "workshop_id":"1",
      "workshop_name":"Бар",
      "delete":"0"
    },
    {  
      "workshop_id":"2",
      "workshop_name":"Кухня",
      "delete":"0"
    },
    {  
      "workshop_id":"3",
      "workshop_name":"Кондитерская",
      "delete":"0"
    },
    {  
      "workshop_id":"4",
      "workshop_name":"Кальян",
      "delete":"0"
    }
  ]
}
Copy to clipboardErrorCopied
Метод возвращает список цехов.

HTTP запрос
GET https://joinposter.com/api/menu.getWorkshops

Параметры ответа menu.getWorkshops
Параметр	Описание
response	Массив объектов
Внутри параметра response лежит массив, в каждом элементе которого есть следующие параметры:

Параметр	Описание
workshop_id	ID цеха
workshop_name	Название цеха
delete	Признак, удалён ли цех: 0 — не удалён, 1 — удалён
📝 Изменить документацию

 Previous
Удалить категорию ингредиентов
Next 
Получить цех
menu.getWorkshop: Свойства цеха
Пример запроса:

<?php
$url = 'https://joinposter.com/api/menu.getWorkshop'
 . '?token=687409:4164553abf6a031302898da7800b59fb'
 . '&workshop_id=1';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":{  
    "workshop_id":"1",
    "workshop_name":"Бар",
    "delete":"0"
  }
}
Copy to clipboardErrorCopied
Метод возвращает свойства цеха.

HTTP запрос
GET https://joinposter.com/api/menu.getWorkshop

GET-параметры запроса menu.getWorkshop
Параметр	Описание
workshop_id	Id цеха
Параметры ответа menu.getWorkshop
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит объект, внутри которого есть следующие параметры:

Параметр	Описание
workshop_id	ID цеха
workshop_name	Название цеха
delete	Признак, удалён ли цех: 0 — не удалён, 1 — удалён
📝 Изменить документацию

 Previous
Получить цеха
Next 
Создать цех
menu.createWorkshop: Создание цеха
Пример запроса:

<?php
$url = 'https://joinposter.com/api/menu.createWorkshop'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$workshop = [
    'workshop_name' => 'Мангал',
];

$data = sendRequest($url, 'post', $workshop);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":5
}
Copy to clipboardErrorCopied
Метод создаёт цех.

HTTP запрос
GET https://joinposter.com/api/menu.createWorkshop

POST-параметры запроса menu.createWorkshop
Параметр	Описание
workshop_name	Обязательный параметр, название цеха
Параметры ответа menu.createWorkshop
Параметр	Описание
response	ID созданного цеха
📝 Изменить документацию

menu.updateWorkshop: Изменение свойств цеха
Пример запроса:

<?php
$url = 'https://joinposter.com/api/menu.updateWorkshop'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$workshop = [
    'workshop_id'  => 5,
    'product_name' => 'Суши',
];

$data = sendRequest($url, 'post', $workshop);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":5
}
Copy to clipboardErrorCopied
Метод изменяет свойства цеха.

HTTP запрос
GET https://joinposter.com/api/menu.updateWorkshop

POST-параметры запроса menu.updateWorkshop
Параметр	Описание
workshop_id	ID цеха
workshop_name	Название цеха
Параметры ответа menu.updateWorkshop
Параметр	Описание
response	ID изменённого цеха
📝 Изменить документацию

menu.removeWorkshop: Удаление цеха
Пример запроса:

<?php
$url = 'https://joinposter.com/api/menu.removeWorkshop'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$workshop = [
    'workshop_id' => 2,
];

$data = sendRequest($url, 'post', $workshop);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":true
}
Copy to clipboardErrorCopied
Метод удаляет цех.

HTTP запрос
GET https://joinposter.com/api/menu.removeWorkshop

POST-параметры запроса menu.removeWorkshop
Параметр	Описание
workshop_id	ID цеха
Параметры ответа menu.removeWorkshop
Параметр	Описание
response	true, если цех успешно удалён
📝 Изменить документацию

storage.getManufactures: Список производств
Пример запроса:

<?
$url = 'https://apidemo.joinposter.com/api/storage.getManufactures'
  . '?format=json'
  . '&token=687409:4164553abf6a031302898da7800b59fb';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{
  "response":[
    {
      "manufacture_id":"4",
      "storage_name":"Склад 1",
      "storage_id":"1",
      "user_id":"4",
      "date":"2016-12-26 14:45:00",
      "sum":70.35,
      "sum_netto":58.63,
      "products":[
        {
          "ingredient_id":"205",
          "product_id":"134",
          "product_name":"Чай цветочный 360мл",
          "product_num":"3.0000",
          "type":"2"
        },
        {
          "ingredient_id":"204",
          "product_id":"137",
          "product_name":"Чай черный с чабрецом 360мл",
          "product_num":"2.0000",
          "type":"2"
        }
      ]
    },
    {
      "manufacture_id":"2",
      "storage_name":"Склад 1",
      "storage_id":"1",
      "user_id":"4",
      "date":"2016-12-26 14:44:00",
      "sum":"32.44",
      "sum_netto":"27.03",
      "products":[
        {
          "ingredient_id":"200",
          "product_id":"109",
          "product_name":"Американо 360мл",
          "product_num":"1.0000",
          "type":"2"
        }
      ]
    }
  ]
}
Copy to clipboardErrorCopied
Запрос на получение списка всех производств.

HTTP запрос
GET https://joinposter.com/api/storage.getManufactures

GET-параметры запроса storage.getManufactures
Параметр	Описание
num	Количество производств, которое необходимо получить
offset	Сколько записей необходимо пропустить от начала списка
Если num и offset не указывать, то будут возвращены все производства без постраничной разбивки

Параметры ответа storage.getManufactures
Параметр	Описание
manufacture_id	ID производства
storage_name	Название склада
storage_id	ID склада
user_id	ID пользователя, который осуществил производство
date	Дата производства
sum	Общая сумма производства (в гривнах/рублях)
sum_netto	Общая сумма производства без НДС (в гривнах/рублях). Возвращается если включена настройка «Считать себестоимость и прибыль нетто»
products	Список тех.карт/полуфабрикатов, которые входят в производство
storage.getManufacture: Данные производства
Пример запроса:

<?
$url = 'https://joinposter.com/api/storage.getManufacture' 
  . '?format=json'
  . '&token=687409:4164553abf6a031302898da7800b59fb'
  . '&manufacture_id=4';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{
  "response":{
    "manufacture_id":"4",
    "storage_name":"Склад 1",
    "storage_id":"1",
    "user_id":"4",
    "date":"2016-12-26 14:45:00",
    "comment":"",
    "sum":70.35,
    "sum_netto":58.63,
    "products":[
      {
        "ingredient_id":"205",
        "product_id":"134",
        "product_name":"Чай цветочный 360мл",
        "product_num":"3.0000",
        "sum":42.21,
        "sum_netto":35.18,
        "type":"2",
        "delete":0
      },
      {
        "ingredient_id":"204",
        "product_id":"137",
        "product_name":"Чай черный с чабрецом 360мл",
        "product_num":"2.0000",
        "sum":28.14,
        "sum_netto":23.45,
        "type":"2",
        "delete":0
      }
    ]
  }
}
Copy to clipboardErrorCopied
Запрос возвращает данные конкретного производства.

HTTP запрос
GET https://joinposter.com/api/storage.getManufacture

GET-параметры запроса storage.getManufacture
Параметр	Описание
manufacture_id	ID производства, для которого необходимо вернуть детальные данные
Параметры ответа storage.getManufacture
Параметр	Описание
manufacture_id	ID производства
storage_name	Название склада
storage_id	ID склада
user_id	ID пользователя, который осуществил производство
date	Дата производства
comment	Комментарий к производству
sum	Общая сумма производства в гривнах
sum_netto	Общая сумма производства без НДС в гривнах. Возвращается если включена настройка «Считать себестоимость и прибыль нетто»
products	Список тех.карт/полуфабрикатов, которые входят в производство
Содержимое параметра products
storage.getManufacturesWriteOffs: Списания по производствам
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage.getManufacturesWriteOffs'
 . '?token=687409:4164553abf6a031302898da7800b59fb'
 . '&date_from=2017-11-30'
 . '&date_to=2017-11-30'
 . '&per_page=10'
 . '&page=5';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":{  
    "count":11,
    "page":{  
      "per_page":10,
      "page":2,
      "count":1
    },
    "data":[  
      {  
        "manufacture_id":15,
        "storage_id":2,
        "date":"2017-11-30 15:00:00",
        "products":[  
          {  
            "product_id":105,
            "type":2,
            "num":10,
            "sum":123.45,
            "sum_netto":102.88,
            "is_fiscal":0,
            "write_offs":[  
              {  
                "ingredient_id":165,
                "type":1,
                "weight":123.45
              }
            ]
          }
        ]
      }
    ]
  }
}
Copy to clipboardErrorCopied
Метод возвращает списания по производствам в диапазоне дат и с постраничной разбивкой.

HTTP GET запрос
https://joinposter.com/api/storage.getManufacturesWriteOffs

GET-параметры запроса storage.getManufacturesWriteOffs
Параметр	Описание
date_from	Дата начала выборки, формат "Y-m-d"
date_to	Дата конца выборки, формат "Y-m-d"
per_page	Количество чеков на одной странице. По умолчанию принимает 100, максимальное значение — 1000.
page	Номер страницы, по умолчанию принимает 1
Параметры ответа storage.getManufacturesWriteOffs
Внутри параметра response лежит объект, внутри которого есть следующие параметры:

Параметр	Описание
count	Общее количество чеков в выбранном диапазоне дат
page	Информация о странице
data	Информация по чекам
storage.createManufacture: Создание производства
Пример запроса:

<?
$url = 'https://joinposter.com/api/storage.createManufacture' 
  . '?format=json'
  . '&token=687409:4164553abf6a031302898da7800b59fb';

$manufacture = [
    "date"          => "2016-12-21 11:12:54",
    "storage_id"    => 1,
    "products"      => [
        [
            "id"    => 64,
            "type"  => 1,
            "num"   => 3
        ],
        [
            "id"    => 65,
            "type"  => 1,
            "num"   => 25
        ],
    ]
];

$data = sendRequest($url, 'post', $manufacture, true);
Copy to clipboardErrorCopied
Пример ответа:

{
  "response":6
}
Copy to clipboardErrorCopied
Запрос создает производство тех.карт и полуфабрикатов.

HTTP запрос
POST https://joinposter.com/api/storage.createManufacture

POST-параметры запроса storage.createManufacture
Параметр	Описание
date	Дата производства
storage_id	ID склада
products	Список тех.карт или полуфабрикатов, которые входят в производство
Содержимое параметра products
Под словом сущность подразумевается тех.карта или полуфабрикат. Когда сущность производится в первый раз, то она получает уникальный ingredient_id, по которому можно будет получить её остатки на складах.

Параметр	Описание
id	ID сущности
num	Количество в шт или кг
type	Тип сущности: 1 — полуфабрикат, 2 — тех.карта
storage.updateManufacture: Изменение данных производства
Пример запроса:

<?
$url = 'https://joinposter.com/api/storage.updateManufacture?' .
  'format=json&token=687409:4164553abf6a031302898da7800b59fb';

$manufacture = [
    "manufacture_id"  => 7,
    "date"            => "2016-12-21 12:12:54",
    "storage_id"      => 1,
    "products" => [
        [
            "id"    => 64,
            "type"  => 1,
            "num"   => 3
        ],
        [
            "id"    => 65,
            "type"  => 1,
            "num"   => 25
        ],
  ]
];

$manufacture_id = sendRequest($url, 'post', $manufacture, true);
Copy to clipboardErrorCopied
Пример ответа:

{
  "response":6
}
Copy to clipboardErrorCopied
Запрос позволяет изменить данные существующего производства.

HTTP запрос
POST https://joinposter.com/api/storage.updateManufacture

POST-параметры запроса storage.updateManufacture
Параметр	Описание
manufacture_id	ID изменяемого производства
date	Дата производства
storage_id	ID склада
products	Список тех.карт/полуфабрикатов, которые входят в производство
Содержимое параметра products
Под словом сущность подразумевается тех.карта или полуфабрикат. Когда сущность производится в первый раз, то она получает уникальный ingredient_id, по которому можно будет получить её остатки на складах.

Параметр	Описание
id	ID сущности
num	Количество (в шт/кг)
type	Тип сущности: 1 — полуфабрикат, 2 — тех.карта
storage.deleteManufacture: Удаление производства
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage.deleteManufacture'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$delete = [
    'manufacture_id' => 1
];

$data = sendRequest($url, 'post', $delete);
Copy to clipboardErrorCopied
Пример ответа:

{
  "response":true
}
Copy to clipboardErrorCopied
Метод удаляет производство.

HTTP запрос
POST https://joinposter.com/api/storage.deleteManufacture

POST-параметры запроса storage.deleteManufacture
Параметр	Описание
manufacture_id	ID производства для удаления
Параметры ответа storage.deleteManufacture
Параметр	Описание
response	Результат удаления производства, true — удалено, false — нет
📝 Изменить документацию

storage.getMoves: Получить все перемещения
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage.getMoves'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{
  "response":[
    {
      "moving_id":4,
      "date":"2017-11-16 21:34:00",
      "from_storage":1,
      "from_storage_name":"Склад Кухня",
      "to_storage":2,
      "to_storage_name":"Склад Бар",
      "user_id":7,
      "user_name":"Vladimir",
      "sum":150.65,
      "sum_netto":125.54
    }
  ]
}
Copy to clipboardErrorCopied
Метод возвращает все перемещения.

HTTP запрос
GET https://joinposter.com/api/storage.getMoves

GET-параметры запроса storage.getMoves
Параметр	Описание
dateFrom	Опциональный параметр, дата начала выборки в формате Ymd, включительно. По умолчанию дата месяц назад.
dateTo	Опциональный параметр, дата конца выборки в формате Ymd, включительно. По умолчанию дата текущего дня.
Параметры ответа storage.getMoves
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит массив, в каждом элементе которого есть следующие параметры:

storage.getMove: Получить содержимое перемещения
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage.getMove'
 . '?token=687409:4164553abf6a031302898da7800b59fb'
 . '&move_id=2';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{
  "response":[
    {
      "moving_id":2,
      "date":"2016-10-30 12:40:00",
      "from_storage":1,
      "from_storage_name":"Склад Кухня",
      "to_storage":2,
      "to_storage_name":"Склад Бар",
      "user_id":7,
      "user_name":"Poster Root",
      "sum":59.31,
      "sum_netto":49.43,
      "ingredients":[
        {
          "link_id":2,
          "ingredient_id":12,
          "product_id":142,
          "ingredient_num":10,
          "ingredient_sum":7.08,
          "ingredient_sum_netto":5.90,
          "type":1,
          "write_off_id":1216696,
          "packing_id":1
        },
        {
          "link_id":3,
          "ingredient_id":91,
          "ingredient_num":1,
          "ingredient_sum":52.23,
          "ingredient_sum_netto":43.53,
          "type":10,
          "write_off_id":1216697,
          "packing_id":2
        }
      ]
    }
  ]
}
Copy to clipboardErrorCopied
Метод возвращает содержимое перемещения, включая ингредиенты и товары.

HTTP запрос
GET https://joinposter.com/api/storage.getMove

GET-параметры запроса storage.getMove
Параметр	Описание
move_id	Обязательный параметр, ID перемещения
timezone	Опциональный параметры, если равен client то дата возвращается в часовом поясе аккаунта.
Параметры ответа storage.getMove
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит объект, внутри которого есть следующие параметры:

storage.createMoving: Создание перемещения
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage.createMoving'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$moving = [
    "moving" => [
        "date"          => "2015-11-18 22:35:54",
        "from_storage"  => "1",
        "to_storage"    => "2",
        "comment"       => "Comment for moving"
    ],
    "ingredient" => [
        [
            "id"        => "138",
            "type"      => "1",
            "num"       => "3",
        ]
    ]
];

$data = sendRequest($url, 'post', $moving);
Copy to clipboardErrorCopied
Пример ответа:

{
  "success":1,
  "response":5
}
Copy to clipboardErrorCopied
Метод создает перемещение.

HTTP запрос
POST https://joinposter.com/api/storage.createMoving

POST-параметры запроса storage.createMoving
Параметр	Описание
date	Дата и время списания в формате Ymd
from_storage_id	ID склада c которого делаем перемещение
to_storage_id	ID склада на который делаем перемещение
comment	Опциональный параметр, комментарий для перемещения
ingredient	Массив объектов для перемещения
Каждый объект массива ingredient содержит следующие параметры

Параметр	Описание
id	ID ингредиента, товара или модификатора товара
type	Тип списываемого объекта: товар, тех.карта, полуфабрикат — 1, ингредиент — 4, модификатор товара — 5
num	Количество списываемого ингредиента
reason	Опциональный параметр, причина списания
packing	Опциональный параметр, ID фасовки
Параметры ответа storage.createMoving
storage.updateMoving: Изменение перемещения
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage.updateMoving'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$moving = [
    "moving" => [
        "moving_id"     => "16",
        "date"          => "2015-11-18 22:35:54",
        "from_storage"  => "1",
        "to_storage"    => "2"
    ],
    "ingredient" => [
        [
            "id"        => "138",
            "type"      => "1",
            "num"       => "3",
        ]
    ]
];

$data = sendRequest($url, 'post', $moving);
Copy to clipboardErrorCopied
Пример ответа:

{
  "success":1,
  "response":16
}
Copy to clipboardErrorCopied
Метод изменяет перемещение.

HTTP запрос
POST https://joinposter.com/api/storage.updateMoving

POST-параметры запроса storage.updateMoving
Параметр	Описание
moving_id	ID перемещения которое редактируем
date	Дата и время списания в формате Ymd
from_storage_id	ID склада c которого делаем перемещение
to_storage_id	ID склада на который делаем перемещение
ingredient	Массив объектов для перемещения
Каждый объект массива ingredient содержит следующие параметры

Параметр	Описание
id	ID ингредиента, товара или модификатора товара
type	Тип списываемого объекта: товар — 1, ингредиент — 4, модификатор товара — 5
num	Количество списываемого ингредиента
reason	Опциональный параметр, причина списания
packing	Опциональный параметр, ID фасовки
Параметры ответа storage.updateMoving
storage.deleteMoving: Удаление перемещения
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage.deleteMoving'
    . '?token=687409:4164553abf6a031302898da7800b59fb';

$delete = [
    'moving_id' => 7
];

$data = sendRequest($url, 'post', $delete);
Copy to clipboardErrorCopied
Пример ответа:

{
  "success":1
}
Copy to clipboardErrorCopied
Метод удаляет перемещение.

HTTP запрос
POST https://joinposter.com/api/storage.deleteMoving

POST-параметры запроса storage.deleteMoving
Параметр	Описание
moving_id	ID перемещения для удаления
Параметры ответа storage.deleteMoving
Параметр	Описание
success	Статус выполнения операции: 1 — успешно, 0 — нет
📝 Изменить документацию

storage.getSupplies: Получить все поставки
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage.getSupplies'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{
  "response":[
    {
      "supply_id":"48",
      "storage_id":"1",
      "supplier_id":"1",
      "date":"2017-11-17 08:09:33",
      "supply_sum":"1800",
      "supply_sum_netto":"1500",
      "supply_comment":"",
      "storage_name":"Склад Кухня",
      "supplier_name":"Закупщик",
      "delete":"1",
      "account_id":null
    },
    {
      "supply_id":"47",
      "storage_id":"1",
      "supplier_id":"1",
      "date":"2017-05-18 09:11:00",
      "supply_sum":"300000",
      "supply_sum_netto":"250000",
      "supply_comment":"",
      "storage_name":"Склад Кухня",
      "supplier_name":"Закупщик",
      "delete":"0",
      "account_id":null
    },
    {
      "supply_id":"46",
      "storage_id":"1",
      "supplier_id":"1",
      "date":"2017-05-18 09:07:00",
      "supply_sum":"669882890",
      "supply_sum_netto":"558235742",
      "supply_comment":"",
      "storage_name":"Склад Кухня",
      "supplier_name":"Закупщик",
      "delete":"0",
      "account_id":null
    }
  ]
}
Copy to clipboardErrorCopied
Метод возвращает все поставки.

HTTP запрос
GET https://joinposter.com/api/storage.getSupplies

GET-параметры запроса storage.getSupplies
Параметр	Описание
dateFrom	Опциональный параметр, дата начала выборки в формате Ymd, включительно. По умолчанию, за все время.
dateTo	Опциональный параметр, дата конца выборки в формате Ymd, включительно. По умолчанию, за все время.
limit	Опциональный параметр, количество поставок, которое необходимо получить. Если используется dateFrom и dateTo то этот параметр игнорируется.
offset	Опциональный параметр, сколько записей необходимо пропустить от начала списка. По умолчанию, будут выданы все поставки. Если используется dateFrom и dateTo то этот параметр игнорируется.
Параметры ответа storage.getSupplies
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит массив, в каждом элементе которого есть следующие параметры:

storage.getSupply: Свойства поставки
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage.getSupply'
 . '?token=687409:4164553abf6a031302898da7800b59fb'
 . '&supply_id=46';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{  
   "response":{  
      "supply_id":"46",
      "in_inventory":"1",
      "storage_id":"1",
      "supplier_id":"1",
      "account_id":"",
      "date":"2017-05-18 09:07:00",
      "supply_sum":"6698828.90",
      "supply_comment":"",
      "supplier_name":"Закупщик",
      "ingredients":[  
         {  
            "ingredient_id":"66",
            "product_id":"86",
            "supply_ingredient_num":"3.0000000",
            "supply_ingredient_sum":"150.00",
            "ingredient_name":"Шен Да Бай Ча-Дзень Гу",
            "ingredient_unit":"kg",
            "pack_id":"3",
            "type":1,
            "ing_delete":"0",
            "tax_id":"0"
         }
      ]
   }
}
Copy to clipboardErrorCopied
Метод возвращает свойства поставки.

HTTP запрос
GET https://joinposter.com/api/storage.getSupply

GET-параметры запроса storage.getSupply
Параметр	Описание
supply_id	Обязательный параметр, указавающий ID поставки
Параметры ответа storage.getSupply
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит массив, в каждом элементе которого есть следующие параметры:

storage.getSupplyIngredients: Получить ингредиенты в поставке
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage.getSupplyIngredients'
 . '?token=687409:4164553abf6a031302898da7800b59fb'
 . '&supply_id=46';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{
  "response":[
    {
      "ingredient_id":"66",
      "supply_ingredient_num":"3.00000",
      "supply_ingredient_sum":"15000",
      "supply_ingredient_sum_netto":"12500",
      "ingredient_name":"Шен Да Бай Ча-Дзень Гу",
      "ingredient_unit":"kg",
      "tax_id": 0
    },
    {
      "ingredient_id":"68",
      "supply_ingredient_num":"2.50000",
      "supply_ingredient_sum":"17500",
      "supply_ingredient_sum_netto":"14583",
      "ingredient_name":"Шен Мен Ку",
      "ingredient_unit":"kg",
      "tax_id": 0
    },
    {
      "ingredient_id":"67",
      "supply_ingredient_num":"130000.00000",
      "supply_ingredient_sum":"650000000",
      "supply_ingredient_sum_netto":"541666667",
      "ingredient_name":"Шен с горы У Лянь Шань-Дзень Гу",
      "ingredient_unit":"kg",
      "tax_id": 0
    },
    {
      "ingredient_id":"69",
      "supply_ingredient_num":"1400.00000",
      "supply_ingredient_sum":"16100000",
      "supply_ingredient_sum_netto":"13416667",
      "ingredient_name":"Шу Пуэр 20 лет",
      "ingredient_unit":"p",
      "tax_id": 0
    },
    {
      "ingredient_id":"76",
      "supply_ingredient_num":"30.00000",
      "supply_ingredient_sum":"390",
      "supply_ingredient_sum_netto":"325",
      "ingredient_name":"Яйца куринные",
      "ingredient_unit":"p",
      "tax_id": 0
    }
  ]
}
Copy to clipboardErrorCopied
Метод возвращает ингредиенты в поставке.

HTTP запрос
GET https://joinposter.com/api/storage.getSupplyIngredients

GET-параметры запроса storage.getSupplyIngredients
Параметр	Описание
supply_id	Обязательный параметр, ID поставки
Параметры ответа storage.getSupplyIngredients
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит массив, в каждом элементе которого есть следующие параметры:

storage.getSuppliers: Получить всех поставщиков
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage.getSuppliers'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{
  "response":[
    {
      "supplier_id":"1",
      "supplier_name":"Закупщик",
      "supplier_phone":"+380981111111",
      "supplier_adress":"",
      "supplier_comment":"",
      "supplier_code":"",
      "supplier_tin":"",
      "delete":"0"
    },
    {
      "supplier_id":"2",
      "supplier_name":"Напитков Иван",
      "supplier_phone":"0956734678",
      "supplier_adress":"ул. Лесная 3",
      "supplier_comment":"",
      "supplier_code":"",
      "supplier_tin":"",
      "delete":"0"
    },
    {
      "supplier_id":"3",
      "supplier_name":"Овощной Иван",
      "supplier_phone":"0987658943",
      "supplier_adress":"ул. Байкальская",
      "supplier_comment":"",
      "supplier_code":"",
      "supplier_tin":"",
      "delete":"0"
    }
  ]
}
Copy to clipboardErrorCopied
Метод возвращает всех поставщиков.

HTTP запрос
GET https://joinposter.com/api/storage.getSuppliers

GET-параметры запроса storage.getSuppliers
Параметр	Описание
id_1c	Опциональный параметр, true если возвращать id_1
Параметры ответа storage.getSuppliers
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит массив, в каждом элементе которого есть следующие параметры:

storage.createSupply: Создание поставки
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage.createSupply'
    . '?token=687409:4164553abf6a031302898da7800b59fb';

$supply = [
    "supply" => [
        "date"          => date("Y-m-d H:i:s"),
        "supplier_id"   => "1",
        "storage_id"    => "1",
        "packing"       => "1"
    ],
    "ingredient" => [
        [
            "id"        => "138",
            "type"      => "1",
            "num"       => "3",
            "sum"       => "6",
        ]
    ]
];

$data = sendRequest($url, 'post', $supply);
Copy to clipboardErrorCopied
Пример ответа:

{
  "success":1,
  "response":7
}
Copy to clipboardErrorCopied
Метод создает поставку.

HTTP запрос
POST https://joinposter.com/api/storage.createSupply

POST-параметры запроса storage.createSupply
Объект supply содержит следующие параметры

Параметр	Описание
date	Дата поставки в формате Y-m-d H:i:s
supplier_id	ID поставщика
storage_id	ID склада на который делаем поставку
supply_comment	Комментарий к поставке
account_id	Опциональный параметр, ID счета в бухгалтерии к которому привязываем поставку
ingredient	Массив объектов для поставки
Каждый объект массива ingredient содержит следующие параметры

Параметр	Описание
id	ID ингредиента, товара или модификатора товара
type	Тип списываемого объекта: товар, производимая техкарта или производимый полуфабрикат — 1, ингредиент — 4, модификатор товара — 5
num	Количество поставляемого ингредиента
sum	Цена за единицу в гривнах, без учета Налога
packing	Опциональный параметр, ID фасовки
tax_id	Опциональный параметр, ID налога
storage.updateSupply: Изменение поставки
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage.updateSupply'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$supply = [
    "supply" => [
        "supply_id"     => "51",
        "supplier_id"   => "1",
        "storage_id"    => "1",
        "date"          => date("Y-m-d H:i:s"),
    ],
    "ingredient" => [
        [
            "id"        => "138",
            "type"      => "1",
            "num"       => "3",
            "sum"       => "6",
        ]
    ]
];

$data = sendRequest($url, 'post', $supply);
Copy to clipboardErrorCopied
Пример ответа:

{
  "success":1,
  "response":"51"
}
Copy to clipboardErrorCopied
Метод изменяет поставку.

HTTP запрос
POST https://joinposter.com/api/storage.updateSupply

POST-параметры запроса storage.updateSupply
Параметр	Описание
supply_id	ID поставки которую редактируем
date	Дата поставки в формате Y-m-d H:i:s
supplier_id	ID поставщика
storage_id	Обязательный параметр, ID склада на который делаем поставку
supply_comment	Комментstorage.deleteSupply: Удаление поставки
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage.deleteSupply'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$delete = [
    'supply_id' => 7
];

$data = sendRequest($url, 'post', $delete);
Copy to clipboardErrorCopied
Пример ответа:

{
  "success":1
}
Copy to clipboardErrorCopied
Метод удаляет поставку.

HTTP запрос
POST https://joinposter.com/api/storage.deleteSupply

POST-параметры запроса storage.deleteSupply
Параметр	Описание
supply_id	ID поставки для удаления
Параметры ответа storage.deleteSupply
Параметр	Описание
success	Статус выполнения операции: 1 — успешно, 0 — нет
📝 Изменить документацию

арий к поставке
account_id	Опциональный параметр, ID счета в бухгалтерии к которому привязываем поставку
ingredient	Массив объектов для поставки
Каждый объект массива ingredient содержит следующие параметры

Параметр	Описание
id	ID ингредиента, товара или модификатора товара
type	Тип списываемого объекта: товар — 1, ингредиент — 4, модификатор товара — 5
num	Количество списываемого ингредиента
sum	Цена за единицу в гривнах
packing	Опциональный параметр, ID фасовки
Параметры ответа storage.updateSupply

storage.createSupplier: Создание поставщика
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage.createSupplier'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$supplier = [
    'supplier_name'    => 'Валера',
    'supplier_adress'  => 'пр. Петровского',
    'supplier_phone'   => 380671234567,
    'supplier_code'    => 32855961,
    'supplier_tin'     => 6449013711,
    'supplier_comment' => 'Мясо',
];

$data = sendRequest($url, 'post', $supplier);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":6
}
Copy to clipboardErrorCopied
Метод создаёт поставщика.

HTTP POST запрос
https://joinposter.com/api/storage.createSupplier

POST-параметры запроса storage.createSupplier
Параметр	Описание
supplier_name	Имя поставщика
supplier_adress	Адрес
supplier_phone	Телефон
supplier_code	ЕГРПОУ
supplier_tin	ИНН
supplier_comment	Комментарий
Параметры ответа storage.createSupplier
Параметр	Описание
response	ID созданного поставщика
📝 Изменить документацию

storage.getIngredientWriteOff: Получить не ручные списания
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage.getIngredientWriteOff'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{
  "response":[
    {
      "write_off_id":"1518217",
      "transaction_id":"388684",
      "tr_product_id":"2125179",
      "storage_id":"1",
      "to_storage":"0",
      "ingredient_id":"936",
      "product_id":"934",
      "modificator_id":"0",
      "prepack_id":"0",
      "weight":"1.00000",
      "unit":"p",
      "cost":"0",
      "cost_netto":"0",
      "user_id":"1",
      "type":"1",
      "time":"1510668937861",
      "date":"2017-11-14 17:15:38",
      "reason":"",
      "product_name":"Fiscal Test",
      "name":"Demo"
    }
  ]
}
Copy to clipboardErrorCopied
Метод возвращает не ручные списания.

HTTP запрос
GET https://joinposter.com/api/storage.getIngredientWriteOff

GET-параметры запроса storage.getIngredientWriteOff
Параметр	Описание
dateFrom	Опциональный параметр, дата начала выборки в формате Ymd, включительно. По умолчанию дата месяц назад.
dateTo	Опциональный параметр, дата конца выборки в формате Ymd, включительно. По умолчанию дата текущего дня.
storage_id	Опциональный параметр, ID склада по которому возвращать списания. По умолчанию по всем складам.
ingredient_id	Опциональный параметр, ID ингредиента по которому возвращать списания. По умолчанию по всем ингредиентам.
Параметры ответа storage.getIngredientWriteOff
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит массив, в каждом элементе которого есть следующие параметры:

storage.createWriteOff: Создание списания
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage.createWriteOff'
    . '?token=687409:4164553abf6a031302898da7800b59fb';

$writeOff = [
    "write_off" => [
        "storage_id"    => "1",
        "date"          => date("Y-m-d H:i:s"),
    ],
    "ingredient" => [
        [
            "id"        => "138",
            "type"      => "1",
            "weight"    => "3",
        ]
    ]
];

$data = sendRequest($url, 'post', $writeOff);
Copy to clipboardErrorCopied
Пример ответа:

{
  "success":1,
  "response":6
}
Copy to clipboardErrorCopied
Метод создает списание.

HTTP запрос
POST https://joinposter.com/api/storage.createWriteOff

POST-параметры запроса storage.createWriteOff
Параметр	Описание
date	Дата поставки в формате Y-m-d H:i:s
storage_id	ID склада с которого делаем списание
ingredient	Массив объектов для списания
reason_id	Опциональный параметр, ID причины списания
Каждый объект массива ingredient содержит следующие параметры

Параметр	Описание
id	ID ингредиента, товара или модификатора товара
type	Тип списываемого объекта: товар — 1, тех.карта — 2, полуфабрикат — 3, ингредиент — 4, модификатор товара — 5
weight	Количество списываемого ингредиента
packing	Опциональный параметр, ID фасовки
reason	Опциональный параметр, комментарий к списаному товару
Параметры ответа storage.createWriteOff
storage.updateWriteOff: Изменение списания
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage.updateWriteOff'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$writeOff = [
    "write_off" => [
        "id"  => "56",
        "storage_id"    => "1",
        "date"          => date("Y-m-d H:i:s"),
    ],
    "ingredient" => [
        [
            "id"        => "138",
            "type"      => "1",
            "weight"    => "3",
        ]
    ]
];

$data = sendRequest($url, 'post', $writeOff);
Copy to clipboardErrorCopied
Пример ответа:

{
  "success":1,
  "response":56
}
Copy to clipboardErrorCopied
Метод измененяет списание.

HTTP запрос
POST https://joinposter.com/api/storage.updateWriteOff

POST-параметры запроса storage.updateWriteOff
Параметр	Описание
id	ID списания которое редактируем
date	Дата поставки в формате Y-m-d H:i:s. Дата должна находиться в инвентаризационном периоде в котором произвели списание.
storage_id	ID склада с которого делаем списание
ingredient	Массив объектов для списания
reason	Опциональный параметр, комментарий к отдельному товару
reason_id	Опциональный параметр, ID причины списания
Каждый объект массива ingredient содержит следующие параметры

Параметр	Описание
id	ID ингредиента, товара или модификатора товара
type	Тип списываемого объекта: товар — 1, тех.карта — 2, полуфабрикат — 3, ингредиент — 4, модификатор товара — 5
weight	Количество списываемого ингредиента
packing	Опциональный параметр, ID фасовки
reason	Опциональный параметр, комментарий к списаному товару
Параметры ответа storage.updateWriteOff
storage.deleteWriteOff: Удаление списания
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage.deleteWriteOff'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$delete = [
    'write_off_id' => 60
];

$data = sendRequest($url, 'post', $delete);
Copy to clipboardErrorCopied
Пример ответа:

{
  "success":1
}
Copy to clipboardErrorCopied
Метод удаляет списание.

HTTP запрос
POST https://joinposter.com/api/storage.deleteWriteOff

POST-параметры запроса storage.deleteWriteOff
Параметр	Описание
write_off_id	ID списания для удаления
Параметры ответа storage.deleteWriteOff
Параметр	Описание
success	Статус выполнения операции: 1 — успешно, 0 — нет
📝 Изменить документацию

storage.getPacks: Список фасовок
Пример запроса:

<?
$url = 'https://joinposter.com/api/storage.getPacks' 
  . '?format=json'
  . '&token=687409:4164553abf6a031302898da7800b59fb';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{
  "response":[
    {
      "pack_id":"1",
      "name":"",
      "unit":"p",
      "count":"0.0000",
      "type":"0"
    },
    {
      "pack_id":"2",
      "name":"",
      "unit":"l",
      "count":"0.0000",
      "type":"0"
    },
    {
      "pack_id":"3",
      "name":"",
      "unit":"kg",
      "count":"0.0000",
      "type":"0"
    },
    {
      "pack_id":"5",
      "name":"Пак молока",
      "unit":"p",
      "count":"20.0000",
      "type":"1"
    },
    {
      "pack_id":"6",
      "name":"Вода очищенная",
      "unit":"l",
      "count":"20.0000",
      "type":"1"
    }
  ]
}
Copy to clipboardErrorCopied
Запрос на получение списка всех фасовок.

HTTP запрос
GET https://joinposter.com/api/storage.getPacks

Параметры ответа storage.getPacks
Параметр	Описание
pack_id	ID фасовки
name	Название фасовки
unit	Единица измерения: kg — кг, p — шт, l — л
count	Количество в шт, кг или литрах
type	Тип фасовки: 0 — базовый, 1 — пользовательский
📝 Изменить документацию

 Previous
Удалить списание
Next 
Получить фасовку
storage.getPack: Получить фасовку
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage.getPack' 
  . '?format=json'
  . '&token=687409:4164553abf6a031302898da7800b59fb'
  . '&pack_id=4';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{
  "response":{
    "pack_id":"5",
    "name":"Пак молока",
    "unit":"p",
    "count":"20.0000",
    "type":"1"
  }
}
Copy to clipboardErrorCopied
Метод возвращает данные конкретной фасовки.

HTTP запрос
GET https://joinposter.com/api/storage.getPack

GET-параметры запроса storage.getPack
Параметр	Описание
pack_id	ID фасовки, для которой необходимо вернуть детальные данные
Параметры ответа storage.getPack
Параметр	Описание
pack_id	ID фасовки
name	Название фасовки
unit	Единица измерения: kg — кг, p — шт, l — л
count	Количество в шт, кг или литрах
type	Тип фасовки: 0 — базовый, 1 — пользовательский
📝 Изменить документацию

storage.createPack: Создание фасовки
Пример запроса
PHP
php
<?php
$url = 'https://joinposter.com/api/storage.createPack'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$pack = [
    'name' => 'Ящик',
    'unit' => 'kg',
    'count' => 0.5,
];

$data = sendRequest($url, 'post', $pack);
cURL
Пример ответа:

{  
  "response": 5
}
Copy to clipboardErrorCopied
Метод создаёт фасовку.

HTTP POST запрос
POST https://joinposter.com/api/storage.createPack

POST-параметры запроса storage.createPack
Параметр	Описание
name	Название фасовки
unit	Единица измерения: kg — кг, p — шт, l — л
count	Количество в шт, кг или литрах
Параметры ответа storage.createPack
Параметр	Описание
response	ID созданной фасовки
📝 Изменить документацию

 Previous
Получить фасовку
Next 
Получить ручные списания
storage.getWastes: Список ручных списаний
Пример запроса:

<?
$url = 'https://joinposter.com/api/storage.getWastes'
  . '?token=687409:4164553abf6a031302898da7800b59fb'
  . '&dateFrom=20170101'
  . '&dateTo=20180101'
  . '&1c=true';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{
  "response": [
    {
      "waste_id": 1,
      "total_sum": 2800,
      "total_sum_netto": 2333,
      "user_id": 1,
      "storage_id": 1,
      "date": "2017-04-26 14:30:02",
      "reason_id": 0,
      "reason_name": null,
      "delete": 0
    },
    {
      "waste_id": 2,
      "total_sum": 791,
      "total_sum_netto": 659,
      "user_id": 1,
      "storage_id": 1,
      "date": "2017-04-26 15:21:12",
      "reason_id": 1,
      "reason_name": "Истек срок годности",
      "delete": 1
    }
  ]
}
Copy to clipboardErrorCopied
Запрос на получение списка всех ручных списаний.

HTTP запрос
GET https://joinposter.com/api/storage.getWastes

GET-параметры запроса storage.getWastes
Параметр	Описание
dateFrom	Опциональный параметр. Дата начала выборки (Ymd). По умолчанию дата месяц назад.
dateTo	Опциональный параметр. Дата конца выборки (Ymd). По умолчанию дата текущего дня.
1с_id	Опциональный параметр. Позволяет возвращать ручные списания с учётом удалённых (вернёт флаг delete). В качестве значения необходимо указать true.
Параметры ответа storage.getWastes
Параметр	Описание
waste_id	ID ручного списания
total_sum	Общая сумма списания
total_sum_netto	Общая сумма списания без НДС. Возвращается если включена настройка «Считать себестоимость и прибыль нетто»
user_id	ID пользователя, который произвёл списание
storage_id	ID склада с которого было произведено списание
date	Дата списания
reason_id	ID причины списания
reason_name	Причина списания
delete	Признак что списание удалено: 1 — удалено, 0 — нет
📝 Изменить документацию

storage.getWaste: Данные ручного списания
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage.getWaste'
  . '?token=687409:4164553abf6a031302898da7800b59fb'
  . '&waste_id=1';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{
  "response": {
    "waste_id": 1,
    "total_sum": 2800,
    "total_sum_netto": 2333,
    "user_id": 1,
    "storage_id": 1,
    "date": "2017-04-26 14:30:02",
    "reason_id": 1,
    "reason_name": "Истек срок годности",
    "elements": [
      {
        "type": 8,
        "product_id": 8,
        "modificator_id": 2,
        "count": 1,
        "ingredients": [
          {
            "write_off_id": 118,
            "ingredient_id": 21,
            "product_id": 8,
            "modificator_id": 2,
            "prepack_id": 0,
            "weight": 1,
            "unit": "p",
            "cost": 800,
            "cost_netto": 667
          }
        ]
      },
      {
        "type": 3,
        "product_id": 4,
        "count": 1,
        "ingredients": [
          {
            "write_off_id": 121,
            "ingredient_id": 16,
            "product_id": 4,
            "modificator_id": 0,
            "prepack_id": 0,
            "weight": 1,
            "unit": "kg",
            "cost": 500,
            "cost_netto": 417
          },
          {
            "write_off_id": 122,
            "ingredient_id": 15,
            "product_id": 4,
            "modificator_id": 0,
            "prepack_id": 0,
            "weight": 1,
            "unit": "kg",
            "cost": 1500,
            "cost_netto": 1250
          }
        ]
      }
    ]
  }
}
Copy to clipboardErrorCopied
Метод возвращает детальные данные конкретного ручного списания.

HTTP запрос
GET https://joinposter.com/api/storage.getWaste

GET-параметры запроса storage.getWaste
Параметр	Описание
waste_id	ID ручного списания для которого необходимо вернуть детальные данные
Параметры ответа storage.getWaste
Параметр	Описание
waste_id	ID ручного списания
total_sum	Общая сумма списания
total_sum_netto	Общая сумма списания без НДС. Возвращается если включена настройка «Считать себестоимость и прибыль нетто»
user_id	id пользователя, который произвёл списание
storage_id	ID склада с которого было произведено списание
date	Дата списания
reason_id	ID причины списания
reason_name	Причина списания
elements	Список списанных сущностей.
У каждого элемента внутри elements следующие параметры:

storage.getWasteReasons: Список причин списания
Пример запроса:

<?
$url = 'https://joinposter.com/api/storage.getWasteReasons'
  . '?token=687409:4164553abf6a031302898da7800b59fb';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{
   "response":[
      {
         "reason_id":1,
         "name":"Истек срок годности"
      }
   ]
}
Copy to clipboardErrorCopied
Метод возвращает список всех причин списания.

HTTP GET запрос
GET https://joinposter.com/api/storage.getWasteReasons

Параметры ответа storage.getWasteReasons
Параметр	Описание
reason_id	ID причины списания
name	Причина списания
📝 Изменить документацию

 Previous
Получить ручное списание
Next 
Получить инвентаризацию по ингредиентам
storage.getInventoryIngredients: Получить инвентаризацию по ингредиентам
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage.getInventoryIngredients'
 . '?token=687409:4164553abf6a031302898da7800b59fb'
 . '&storage_id=1';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{
  "response":{
    "ingredients":{
      "115":{
        "item_id":"11",
        "item":"Яблочный",
        "startrest":655,
        "startrestcurrency":8508.45,
        "startrestcurrency_netto":7090.38,
        "income":0,
        "charges":1563,
        "writeoff":0,
        "writeoffcurrency":0,
        "writeoffcurrency_netto":0,
        "estimatedrest":-908,
        "primecost":12.99,
        "primecost_netto":10.83,
        "factrest":"''",
        "fact_rest_in_prepack":"''",
        "fact_rest_sum":"''",
        "difference":"''",
        "diffcurrency":"''",
        "diffcurrency_netto":"''",
        "partial_write_off":"0",
        "unit":"pcs",
        "db_unit":"p"
      },
      "116":{
        "item_id":"76",
        "item":"Яйца куринные (ing)",
        "startrest":21,
        "startrestcurrency":36.54,
        "startrestcurrency_netto":30.45,
        "income":0,
        "charges":1699,
        "writeoff":0,
        "writeoffcurrency":0,
        "writeoffcurrency_netto":0,
        "estimatedrest":-1678,
        "primecost":1.74,
        "primecost_netto":1.45,
        "factrest":"''",
        "fact_rest_in_prepack":"''",
        "fact_rest_sum":"''",
        "difference":"''",
        "diffcurrency":"''",
        "diffcurrency_netto":"''",
        "partial_write_off":"0",
        "unit":"pcs",
        "db_unit":"p"
      }
    },
    "manufactures":[

    ],
    "prepacks":{      
      "930":{
        "product_id":"930",
        "product_name":"Кальян с сюрпризом",
        "type":"2",
        "weight_flag":"0",
        "delete":"0",
        "factrest":0,
        "count":0,
        "cost":0,
        "cost_netto":0,
        "saved":0
      },
      "931":{
        "product_id":"931",
        "product_name":"Маринованные грибы",
        "type":"1",
        "weight_flag":"0",
        "delete":"0",
        "factrest":0,
        "count":0,
        "cost":0,
        "cost_netto":0,
        "saved":0
      }
    }
  }
}
Copy to clipboardErrorCopied
Метод возвращает инвентаризацию по ингредиентам.

HTTP запрос
GET https://joinposter.com/api/storage.getInventoryIngredients

GET-параметры запроса storage.getInventoryIngredients
Параметр	Описание
storage_id	ID склада, если inventory_id не указан то обязательный параметр
inventory_id	ID инвентаризации, если storage_id не указан то обязательный параметр
Параметры ответа storage.getInventoryIngredients
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит объект, внутри которого есть следующие параметры:

storage.getStorageInventories: Получить архив инвентаризаций по складам
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage.getStorageInventories'
 . '?token=687409:4164553abf6a031302898da7800b59fb'
 . '&storage_id=1';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{
  "response":[
    {
      "inventory_id":"3",
      "storage_id":"1",
      "date_start":"2015-08-12 19:07:08",
      "date_end":"2017-05-18 09:10:31",
      "date_set":"0000-00-00 00:00:00",
      "date_inventory":"2017-05-18 09:10:31",
      "sum":"871875648398",
      "sum_netto":"726563040332",
      "inventory_status":"1"
    },
    {
      "inventory_id":"2",
      "storage_id":"1",
      "date_start":"2015-02-05 13:10:26",
      "date_end":"2015-08-12 19:07:08",
      "date_set":"0000-00-00 00:00:00",
      "date_inventory":"0000-00-00 00:00:00",
      "sum":"104384",
      "sum_netto":"86987",
      "inventory_status":"1"
    },
    {
      "inventory_id":"1",
      "storage_id":"1",
      "date_start":"2013-08-09 16:30:13",
      "date_end":"2015-02-05 13:10:26",
      "date_set":"0000-00-00 00:00:00",
      "date_inventory":"0000-00-00 00:00:00",
      "sum":"-21236",
      "sum_netto":"-17697",
      "inventory_status":"1"
    }
  ]
}
Copy to clipboardErrorCopied
Метод возвращает архив инвентаризаций по складам.

HTTP запрос
GET https://joinposter.com/api/storage.getStorageInventories

GET-параметры запроса storage.getStorageInventories
Параметр	Описание
storage_id	Обязательный параметр, ID склада по которому возвращать инвентаризации
Параметры ответа storage.getStorageInventories
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит массив, в каждом элементе которого есть следующие параметры:

storage.getStorageLeftovers: Получить все остатки на складах
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage.getStorageLeftovers'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{
  "response":[
    {
      "ingredient_id":"39",
      "ingredient_name":"Яблоки",
      "ingredient_left":"3143.00000",
      "limit_value":"0",
      "ingredient_unit":"p",
      "ingredients_type":"2",
      "storage_ingredient_sum":"4591923",
      "storage_ingredient_sum_netto":"3826603",
      "prime_cost":1461,
      "prime_cost_netto":1218,
      "hidden":"0"
    },
    {
      "ingredient_id":"11",
      "ingredient_name":"Яблочный",
      "ingredient_left":"-908.00000",
      "limit_value":"0",
      "ingredient_unit":"p",
      "ingredients_type":"2",
      "storage_ingredient_sum":"0",
      "storage_ingredient_sum_netto":"0",
      "prime_cost":1299,
      "prime_cost_netto":1083,
      "hidden":"0"
    },
    {
      "ingredient_id":"76",
      "ingredient_name":"Яйца куринные",
      "ingredient_left":"-1678.00000",
      "limit_value":"0",
      "ingredient_unit":"p",
      "ingredients_type":"1",
      "storage_ingredient_sum":"0",
      "storage_ingredient_sum_netto":"0",
      "prime_cost":174,
      "prime_cost_netto":145,
      "hidden":"0"
    }
  ]
}
Copy to clipboardErrorCopied
Метод возвращает остатки по складам.

HTTP запрос
GET https://joinposter.com/api/storage.getStorageLeftovers

GET-параметры запроса storage.getStorageLeftovers
Параметр	Описание
storage_id	Опциональный параметр, ID склада по которому возвращать остатки. Если не указан, будут выданы по все складам.
type	Опциональный параметр, тип сущности по которой возвращать остатки: 1 — ингредиент, 2 — товар, 3 - модификатор товара, 4 - производимая тех-карта, 5 — производимый полуфабрикат. Если не указан, будут выданы по все сущностям.
category_id	Опциональный параметр, ID категории по которой получать ингредиенты. Если не передать type будет вовзращать остатки по товару, тех-карте, полуфабрикату. По умолчанию по всем категориям.
zero_leftovers	Опциональный параметр, если true, метод возвращает нулевые остатки. По умолчанию, не возвращаются.
Параметры ответа storage.getStorageLeftovers
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит массив, в каждом элементе которого есть следующие параметры:

storage.getStorages: Получить все склады
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage.getStorages'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{
  "response":[
    {
      "storage_id":"1",
      "storage_name":"Склад Кухня",
      "storage_adress":"",
      "delete":"0"
    },
    {
      "storage_id":"2",
      "storage_name":"Склад Бар",
      "storage_adress":"",
      "delete":"0"
    }
  ]
}
Copy to clipboardErrorCopied
Метод возвращает все склады.

HTTP запрос
GET https://joinposter.com/api/storage.getStorages

Параметры ответа storage.getStorages
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит массив, в каждом элементе которого есть следующие параметры:

Параметр	Описание
storage_id	ID склада
storage_name	Название склада
storage_adress	Адрес склада
delete	Признак удален ли склад: 1 — удален, 0 — нет
📝 Изменить документацию

storage.getStorage: Свойства склада
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage.getStorage'
 . '?token=687409:4164553abf6a031302898da7800b59fb'
 . '&storage_id=1';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{  
   "response":{
      "storage_id":"1",
      "storage_name":"Склад Кухня",
      "storage_adress":"",
      "delete":"0"
   }
}
Copy to clipboardErrorCopied
Метод возвращает свойства склада.

HTTP GET запрос
GET https://joinposter.com/api/storage.getStorage

GET-параметры запроса storage.getStorage
Параметр	Описание
storage_id	Обязательный параметр, обозначает ID склада
Параметры ответа storage.getStorage
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит объект, в котором есть следующие параметры:

storage.getReportMovement: Отчет по движению
Пример запроса:

<?
$url = 'https://joinposter.com/api/storage.getReportMovement'
  . '?token=687409:4164553abf6a031302898da7800b59fb'
  . '&dateFrom=20170101'
  . '&dateTo=20180101'
  . '&storage_id=1'
  . '&type=2';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{
   "response":[
      {
         "ingredient_id":"332",
         "ingredient_name":"Borjome",
         "cost_start":13.63,
         "cost_end":13.63,
         "start":14,
         "income":0,
         "write_offs":0,
         "end":14
      },
      {
         "ingredient_id":"260",
         "ingredient_name":"Sprite",
         "cost_start":8.39,
         "cost_end":8.39,
         "start":2,
         "income":0,
         "write_offs":0,
         "end":2
      }
   ]
}
Copy to clipboardErrorCopied
Запрос на получение отчета по движению ингредиентов.

HTTP запрос
GET https://joinposter.com/api/storage.getReportMovement

GET-параметры запроса storage.getReportMovement
Параметр	Описание
dateFrom	Опциональный параметр, дата начала выборки в формате Ymd, включительно. По умолчанию дата месяц назад.
dateTo	Опциональный параметр, дата конца выборки в формате Ymd, включительно. По умолчанию дата текущего дня.
storage_id	Опциональный параметр, обозначает ID склада
type	Опциональный параметр, тип ингредиентов, по которым нужно получить ответ: 1 — ингредиенты, 2 — товары, 3 — модификации товаров, 4 - тех. карты, 5 - полуфабрикаты.
Параметры ответа storage.getReportMovement
Параметр	Описание
ingredient_id	ID ингредиента
ingredient_name	Название ингредиента
cost_start	Средняя себестоимость ингредиента на дату начала выборки в рублях\гривнах
cost_end	Средняя себестоимость ингредиета на дату окончания выборки в рублях\гривних
start	Остаток ингредиента на дату начала выборки
income	Поступления ингредиента
write_offs	Расход ингредиента
end	Остаток ингредиента на дату конца выборки
📝 Изменить документацию

storage.createStorage: Создать склад
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage.createStorage'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$storage = [
    "storage_name"    => "Склад3 Кухня",
    "storage_adress"  => "Klenova 3"
];

$data = sendRequest($url, 'post', $storage);
Copy to clipboardErrorCopied
Пример ответа:

{  
   "response":6
}
Copy to clipboardErrorCopied
Метод создает склад.

HTTP POST запрос
GET https://joinposter.com/api/storage.createStorage

POST-параметры запроса storage.createStorage
Параметр	Описание
storage_name	Название склада
storage_adress	Адрес склада
Параметры ответа storage.createStorage
Параметр	Описание
response	ID созданного склада
📝 Изменить документацию

storage.updateStorage: Изменить склад
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage.updateStorage'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$storage = [
    "storage_id"      => 7,
    "storage_name"    => "Склад Кухня",
    "storage_adress"  => "Klenova 8"
];

$data = sendRequest($url, 'post', $storage);
Copy to clipboardErrorCopied
Пример ответа:

{  
   "response":7
}
Copy to clipboardErrorCopied
Метод изменяет склад.

HTTP запрос
GET https://joinposter.com/api/storage.updateStorage

POST-параметры запроса storage.updateStorage
Параметр	Описание
storage_id	ID склада
storage_name	Название склада
storage_adress	Адрес склада
Параметры ответа storage.updateStorage
Параметр	Описание
response	ID обновленного склада
📝 Изменить документацию

GET storage/butcheries: Получение списка переработок
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage/butcheries'
    . '?token=687409:4164553abf6a031302898da7800b59fb';

$data = sendRequest($url, 'get');
Copy to clipboardErrorCopied
Пример ответа:

{
  "response": {
    "data": [
      {
        "id": 3,
        "date": "2024-09-16T11:36:00.000000Z",
        "comment": "",
        "userId": 1,
        "fromIngredients": [
          {
            "ingredientId": 71,
            "storageId": 1,
            "name": "Семга",
            "unit": "kg",
            "count": 5,
            "sum": 2500,
            "sumNetto": 2500
          }
        ],
        "toIngredients": [
          {
            "ingredientId": 87,
            "storageId": 1,
            "name": "Семга стейк",
            "unit": "kg",
            "count": 1,
            "selfpricePercent": 40,
            "sum": 1000,
            "sumNetto": 1000
          },
          {
            "ingredientId": 844,
            "storageId": 1,
            "name": "семга филе",
            "unit": "kg",
            "count": 0.5,
            "selfpricePercent": 60,
            "sum": 1500,
            "sumNetto": 1500
          }
        ]
      }
    ],
    "pagination": {
      "total": 1,
      "perPage": 100,
      "currentPage": 1,
      "totalPages": 1
    }
  }
}
Copy to clipboardErrorCopied
Метод возвращает список переработок ингредиентов.

HTTP запрос
GET https://joinposter.com/api/storage/butcheries

GET-параметры запроса storage/butcheries
Параметр	Описание
page	Номер страницы для пагинации
perPage	Количество переработок на одной странице
dateFrom	Дата начала периода выборки в формате ISO 8601
dateTo	Дата окончания периода выборки в формате ISO 8601
Параметры ответа storage/butcheries
Параметр	Описание
data	Массив переработок с подробной информацией
pagination	Объект с информацией о пагинации, включая общее количество страниц, текущую страницу и количество переработок на странице
Возможные ответы
storage/butcheries/{id}: Получение одной переработки
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage/butcheries/1'
    . '?token=687409:4164553abf6a031302898da7800b59fb';

$data = sendRequest($url, 'get');
Copy to clipboardErrorCopied
Пример ответа:

{
  "response": {
    "id": 3,
    "date": "2024-09-16T11:36:00.000000Z",
    "comment": "",
    "userId": 1,
    "fromIngredients": [
      {
        "ingredientId": 71,
        "storageId": 1,
        "name": "Семга",
        "unit": "kg",
        "count": 5,
        "sum": 2500,
        "sumNetto": 2500
      }
    ],
    "toIngredients": [
      {
        "ingredientId": 87,
        "storageId": 1,
        "name": "Семга стейк",
        "unit": "kg",
        "count": 1,
        "selfpricePercent": 40,
        "sum": 1000,
        "sumNetto": 1000
      },
      {
        "ingredientId": 844,
        "storageId": 1,
        "name": "семга филе",
        "unit": "kg",
        "count": 0.5,
        "selfpricePercent": 60,
        "sum": 1500,
        "sumNetto": 1500
      }
    ]
  }
}
Copy to clipboardErrorCopied
Метод возвращает одну переработку ингредиентов по заданному ID.

HTTP запрос
GET https://joinposter.com/api/storage.getButchery/{id}

Параметры ответа storage.getButchery
Параметр	Описание
id	ID переработки
date	Дата переработки в формате ISO 8601
comment	Комментарий к переработке
userId	ID пользователя, создавшего переработку
fromIngredients	Массив исходных ингредиентов
toIngredients	Массив полученных ингредиентов
Возможные ответы
HTTP-код	Описание
200	Запрос выполнен успешно
404	Переработка не найдена
500	Внутренняя ошибка сервера
Возможные ошибки
POST storage/butcheries: Создание переработки
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage/butcheries'
    . '?token=687409:4164553abf6a031302898da7800b59fb';

$butchery = [
    "date"          => date("Y-m-d H:i:s"),
    "comment"       => "",
    "fromIngredients" => [
        [
            "ingredientId"   => 71,
            "storageId"      => 1,
            "count"          => 5,
        ]
    ],
    "toIngredients" => [
        [
            "ingredientId"   => 87,
            "storageId"      => 1,
            "count"          => 1,
            "selfpricePercent" => 40,
        ],
        [
            "ingredientId"   => 844,
            "storageId"      => 1,
            "count"          => 0.5,
            "selfpricePercent" => 60,
        ]
    ]
];

$data = sendRequest($url, 'post', $butchery);
Copy to clipboardErrorCopied
Пример ответа:

{
  "response": {
    "id": 1,
    "date": "2024-09-16T11:36:00.000000Z",
    "comment": "",
    "fromIngredients": [
      {
        "ingredientId": 71,
        "storageId": 1,
        "name": "Семга",
        "unit": "kg",
        "count": 5,
        "sum": 2500,
        "sumNetto": 2500
      }
    ],
    "toIngredients": [
      {
        "ingredientId": 87,
        "storageId": 1,
        "name": "Семга стейк",
        "unit": "kg",
        "count": 1,
        "selfpricePercent": 40,
        "sum": 1000,
        "sumNetto": 1000
      },
      {
        "ingredientId": 844,
        "storageId": 1,
        "name": "семга филе",
        "unit": "kg",
        "count": 0.5,
        "selfpricePercent": 60,
        "sum": 1500,
        "sumNetto": 1500
      }
    ]
  }
}
Copy to clipboardErrorCopied
Метод создает переработку, превращая одни ингредиенты в другие.

HTTP запрос
POST https://joinposter.com/api/storage/butcheries

POST-параметры запроса storage/butcheries
Объект butchery содержит следующие параметры:

Параметр	Описание
date	Дата переработки в формате Y-m-d H:i:s
comment	Комментарий к переработке
fromIngredients	Массив ингредиентов, из которых происходит переработка
toIngredients	Массив ингредиентов, которые получены в результате переработки
Содержимое массива fromIngredients
Параметр	Описание
ingredientId	ID ингредиента
count	Количество ингредиента в шт или кг
storageId	ID склада, с которого списываются ингредиенты
PUT storage/butcheries/{id}: Редактирование переработки
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage/butcheries/1'
    . '?token=687409:4164553abf6a031302898da7800b59fb';

$butchery = [
    "date" => "2024-09-16T11:36Z",
    "comment" => "",
    "fromIngredients" => [
        [
            "ingredientId" => 71,
            "storageId" => 1,
            "count" => 5
        ]
    ],
    "toIngredients" => [
        [
            "ingredientId" => 87,
            "storageId" => 1,
            "count" => 1,
            "selfpricePercent" => 40
        ],
        [
            "ingredientId" => 844,
            "storageId" => 1,
            "count" => 0.5,
            "selfpricePercent" => 40
        ],
        [
            "ingredientId" => 70,
            "storageId" => 1,
            "count" => 2.5,
            "selfpricePercent" => 20
        ]
    ]
];

$data = sendRequest($url, 'put', $butchery);
Copy to clipboardErrorCopied
Пример ответа:

{
    "response": {
        "id": 2,
        "date": "2024-09-16T11:36:00.000000Z",
        "comment": "",
        "userId": 1,
        "fromIngredients": [
            {
                "ingredientId": 71,
                "storageId": 1,
                "name": "Семга",
                "unit": "kg",
                "count": 5,
                "sum": 2500,
                "sumNetto": 2500
            }
        ],
        "toIngredients": [
            {
                "ingredientId": 87,
                "storageId": 1,
                "name": "Семга стейк",
                "unit": "kg",
                "count": 1,
                "selfpricePercent": 40,
                "sum": 1000,
                "sumNetto": 1000
            },
            {
                "ingredientId": 844,
                "storageId": 1,
                "name": "семга филе",
                "unit": "kg",
                "count": 0.5,
                "selfpricePercent": 40,
                "sum": 1000,
                "sumNetto": 1000
            },
            {
                "ingredientId": 70,
                "storageId": 1,
                "name": "Семга с/с",
                "unit": "kg",
                "count": 2.5,
                "selfpricePercent": 20,
                "sum": 500,
                "sumNetto": 500
            }
        ]
    }
}
Copy to clipboardErrorCopied
Метод редактирует существующую переработку ингредиентов.

HTTP запрос
PUT https://joinposter.com/api/storage/butcheries/{id}

PUT-параметры запроса storage/butcheries/{id}
Параметр	Описание
date	Дата переработки в формате ISO 8601
comment	Комментарий к переработке
fromIngredients	Список ингредиентов, из которых происходит переработка
toIngredients	Список ингредиентов, полученных в результате переработки
Содержимое массива fromIngredients
Параметр	Описание
ingredientId	ID ингредиента
count	Количество в шт или кг
storageId	ID склада, с которого списываются ингредиенты
Содержимое массива toIngredients
DELETE storage/butcheries/{id}: Удаление переработки
Пример запроса:

<?php
$url = 'https://joinposter.com/api/storage/butcheries/1'
    . '?token=687409:4164553abf6a031302898da7800b59fb';

$data = sendRequest($url, 'delete');
Copy to clipboardErrorCopied
Пример ответа:

{
  "response": true
}
Copy to clipboardErrorCopied
Метод удаляет переработку ингредиентов по заданному ID.

HTTP запрос
DELETE https://joinposter.com/api/storage/butcheries/{id}

Параметры ответа storage/butcheries
Параметр	Описание
response	Результат выполнения операции: true — успешно, false — ошибка
Возможные ответы
HTTP-код	Описание
200	Переработка успешно удалена
404	Переработка не найдена
500	Внутренняя ошибка сервера
Возможные ошибки
clients: Маркетинг

Методы для работы с разделом маркетинга. Все методы данного раздела начинаются с «clients». Список доступных методов:

clients.getClients: Список клиентов
clients.getClient: Свойства клиента
clients.createClient: Создать клиента
clients.createClients: Создать несколько клиентов
clients.updateClient: Изменить свойства клиента
clients.removeClient: Удалить клиента
clients.removeClients: Удалить группу клиентов
clients.getClientPrizes: Список товаров выданных по акциям
clients.changeClientBonus: Изменить количество бонусов клиента
clients.changeClientPayedSum: Изменить общую сумму покупок клиента
clients.getClientsAccumulations: Список накоплений клиента по акциям
clients.addClientsAccumulations: Изменить накопление клиента по акциям
clients.getPromotions: Список акций
clients.getPromotion: Свойства акции
clients.removePromotion: Удалить акцию
clients.addEWalletPayment: Пополнить депозитный счет клиента
clients.addEWalletTransaction: Списать с депозитного счет клиента
clients.getGroups: Список групп клиентов
clients.getGroup: Свойства группы клиентов
clients.createGroup: Создать группу клиентов
clients.updateGroup: Изменить группу клиентов
clients.removeGroup: Удалить группу клиентов
clients.getLoyaltyRules: Свойства правил перехода
clients.createLoyaltyRules: Создать правила перехода
clients.updateLoyaltyRules: Изменить правила перехода
clients.removeLoyaltyRules: Удалить правила перехода
clients.sendSms: Отправить SMS от имени аккаунта
clients.feedbacks: Добавить отзыв
clients.getFeedbacksStats: Получить статистику по отзывам
clients.set1cClientId: Изменить ID клиента в системе 1С
📝 Изменить документацию

 Previous
Склад
Next 
Чеки
transactions.getTransactions: Список чеков
Пример запроса:

<?php
$url = 'https://joinposter.com/api/transactions.getTransactions'
 . '?token=687409:4164553abf6a031302898da7800b59fb'
 . '&date_from=2017-11-30'
 . '&date_to=2017-11-30'
 . '&per_page=10'
 . '&page=5';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{
  "response":{
    "count":41,
    "page":{
      "per_page":10,
      "page":5,
      "count":1
    },
    "data":[
      {
        "transaction_id":25221,
        "table_id":1,
        "spot_id":1,
        "client_id":68,
        "sum":"360.00",
        "payed_sum":"0.00",
        "payed_cash":"0.00",
        "payed_card":"0.00",
        "payed_cert":"0.00",
        "payed_bonus":"0.00",
        "payed_third_party":"0.00",
        "round_sum":"0.00",
        "pay_type":3,
        "reason":0,
        "tip_sum":"0.00",
        "bonus":0,
        "discount":100,
        "print_fiscal":0,
        "date_close":"2017-11-30 13:48:09",
        "products":[
          {
            "product_id":469,
            "modification_id":0,
            "type":2,
            "workshop_id":2,
            "num":2,
            "product_sum":"360.00",
            "payed_sum":"0.00",
            "cert_sum":"0.00",
            "bonus_sum":"0.00",
            "bonus_accrual":"0.00",
            "round_sum":"0.00",
            "discount":100,
            "print_fiscal":0,
            "tax_id":0,
            "tax_value":0,
            "tax_type":0,
            "tax_fiscal":0,
            "tax_sum":"0.00"
          }
        ]
      }
    ]
  }
}
Copy to clipboardErrorCopied
Метод возвращает список чеков с товарами в диапазоне дат с постраничной разбивкой.

HTTP GET запрос
https://joinposter.com/api/transactions.getTransactions

GET-параметры запроса transactions.getTransactions
Параметр	Описание
date_from	Дата начала выборки, формат "Y-m-d"
date_to	Дата конца выборки, формат "Y-m-d"
per_page	Количество чеков на одной странице. По умолчанию принимает 100, максимальное значение — 1000.
page	Номер страницы, по умолчанию принимает 1
Параметры ответа transactions.getTransactions
Внутри параметра response лежит объект, внутри которого есть следующие параметры:

Параметр	Описание
count	Общее количество чеков в выбранном диапазоне дат
page	Информация о странице
data	Информация по чекам
transactions.getTransactionsWriteOffs: Списания по чекам
Пример запроса:

<?php
$url = 'https://joinposter.com/api/transactions.getTransactionsWriteOffs'
 . '?token=687409:4164553abf6a031302898da7800b59fb'
 . '&date_from=2017-11-30'
 . '&date_to=2017-11-30'
 . '&per_page=10'
 . '&page=5';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":{  
    "count":41,
    "page":{  
      "per_page":10,
      "page":5,
      "count":1
    },
    "data":[  
      {  
        "transaction_id":25221,
        "write_offs":[  
          {  
            "write_off_id":143731,
            "storage_id":3,
            "product_id":469,
            "modificator_id":0,
            "ingredient_id":30,
            "prepack_id":0,
            "cost":26.68,
            "cost_netto":22.23,
            "weight":0.16,
            "unit":"kg",
            "reason":""
          }
        ]
      }
    ]
  }
}
Copy to clipboardErrorCopied
Метод возвращает списания по чекам в диапазоне дат и с постраничной разбивкой.

HTTP GET запрос
https://joinposter.com/api/transactions.getTransactionsWriteOffs

GET-параметры запроса transactions.getTransactionsWriteOffs
Параметр	Описание
date_from	Дата начала выборки, формат "Y-m-d"
date_to	Дата конца выборки, формат "Y-m-d"
per_page	Количество чеков на одной странице. По умолчанию принимает 100, максимальное значение — 1000.
page	Номер страницы, по умолчанию принимает 1
Параметры ответа transactions.getTransactionsWriteOffs
Внутри параметра response лежит объект, внутри которого есть следующие параметры:

Параметр	Описание
count	Общее количество чеков в выбранном диапазоне дат
page	Информация о странице
data	Информация по чекам
transactions.getTransactionDishComposition: Состав проданной тех. карты
Пример запроса:

<?php
$url = 'https://joinposter.com/api/transactions.getTransactionDishComposition'
 . '?token=687409:4164553abf6a031302898da7800b59fb'
 . '&transaction_id=76'
 . '&product_id=82'
 . '&modificator_id=22';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":{  
    "transaction_id":76,
    "product_id":82,
    "modificator_id":22,
    "num":1,
    "ingredients":[  
      {  
        "ingredient_id":135,
        "type":1,
        "weight":0.6
      },
      {  
        "ingredient_id":24,
        "type":2,
        "weight":0.05
      },
      {  
        "ingredient_id":136,
        "type":1,
        "weight":2
      }
    ]
  }
}
Copy to clipboardErrorCopied
Метод возвращает состав проданной тех. карты.

HTTP GET запрос
https://joinposter.com/api/transactions.getTransactionDishComposition

GET-параметры запроса transactions.getTransactionDishComposition
Параметр	Описание
transaction_id	ID чека
product_id	ID тех. карты
modificator_id	ID модификатора, по умолчанию принимает 0
Параметры ответа transactions.getTransactionDishComposition
Внутри параметра response лежит объект, внутри которого есть следующие параметры:

Параметр	Описание
transaction_id	ID чека
product_id	ID тех. карты
modificator_id	ID модификатора
num	Количество тех. карты в чеке
ingredients	Состав тех. карты на момент продажи
Создание чека
Пример запроса:

curl -X POST 'https://joinposter.com/api/orders?token=687409:4164553abf6a031302898da7800b59fb' \
-H 'Content-Type: application/json' \
-d '{
    "spotId": 1,
    "tableId": 1,
    "waiterId": 4,
    "guestsCount": 1,
    "serviceMode": 3,
    "autoAccept": false,
    "client": {
        "id": 1,
        "firstName" : "Test",
        "lastName" : "Test",
        "phone": "+380501111111",
        "email": "test@gmail.com",
        "address": {
            "street": "address1",
            "additionalInfo": "address2",
            "comment": "Some comment",
            "lat": "",
            "lng": ""
        }
    },
    "comment": "Some comment",
    "products": [
        {
            "id": 25,
            "count": 2,
            "price": 33.11,
            "comment": "Some comment"
        },
        {
            "id": 35,
            "count": 0.04
        },
        {
            "id": 18,
            "count": 3,
            "modificatorId": 1,
            "comment": "Some comment #2"
        },
        {
            "id": 39,
            "count": 1,
            "comment": "Some comment #3",
            "modification": [
                {
                    "id": 6,
                    "count": 1
                }
            ]
        }
    ],
    "delivery": {
        "courierId": 1,
        "processingStatus": 40,
        "deliveryPrice": 100.66,
        "time": "2024-07-15 16:30:02",
        "paymentMethodId": 2
    },
    "payments": [
        {
        "sum": 762.86
        }
    ],
    "acquirerPayments": [
        {
            "amount": 1660.11,
            "bankAcquirer": "CREDIT AGRICOLE BANK JSC",
            "paymentSystemName": "liqpay",
            "pan": "544535*51",
            "authCode": "461384",
            "rrn": "461386",
            "terminalId": "414963",
            "companyCode": "34554363",
            "paymentSystemMethod": "cardTransfer"
        }, 
        {
            "amount": 1660.00,
            "bankAcquirer": "Private 24",
            "paymentSystemName": "liqpay",
            "pan": "544535*50",
            "authCode": "461386",
            "rrn": "461386",
            "terminalId": "414963",
            "companyCode": "34554363"
        }
    ]
}'
Copy to clipboardErrorCopied
Пример ответа:

{
  "response": {
    "id": 156,
    "status": 0,
    "payType": 0,
    "sum": 343.72,
    "spotId": 1,
    "tableId": 0,
    "waiterId": 0,
    "guestsCount": 1,
    "serviceMode": 3,
    "client": {
      "id": 1
    },
    "comment": "Some comment",
    "products": [
      {
        "id": 25,
        "count": 2,
        "price": 33.11,
        "comment": "Some comment"
      },
      {
        "id": 35,
        "count": 0.04,
        "price": 600
      },
      {
        "id": 18,
        "count": 3,
        "price": 12,
        "modificatorId": 1,
        "comment": "Some comment #2"
      },
      {
        "id": 39,
        "count": 1,
        "price": 1.5,
        "modification": [
          {
            "id": 6,
            "count": 1
          }
        ],
        "comment": "Some comment #3"
      }
    ],
    "delivery": {
      "courierId": 1,
      "processingStatus": 40,
      "deliveryPrice": 100
    }
  }
}
Copy to clipboardErrorCopied
Метод создаёт чек.

HTTP запрос
POST https://joinposter.com/api/orders

POST-параметры запроса
Параметр	Описание
spotId	ID заведения в котором нужно создать чек
tableId	ID стола
waiterId	ID сотрудника
guestsCount	Количество гостей за столом
serviceMode	Опциональный параметр, по умолчанию service_mode = 1. Тип заказа: 1 — в заведении, 2 — навынос, 3 — доставка
autoAccept	Опциональный параметр, по умолчанию autoAccept = true. Определяет автоматическое принятие заказа: false - заказ требует ручного подтверждения, true - заказ принимается автоматически
Внутри параметра client лежит объект, внутри которого есть следующие параметры:

Параметр	Описание
id	ID клиента в Poster, если id не указан, то нужно передать параметр phone. Poster попробует найти клиента с таким же номером телефона и привяжет его к заказу. Если это новый клиент, то официант выберет для него группу и Poster создаст нового клиента.
firstName	Имя клиента, по умолчанию не передаётся
lastName	Фамилия клиента, по умолчанию не передаётся
phone	Телефон клиента, обязательный параметр если не указан client ID
email	Эл. почта, по умолчанию не передаётся
Внутри параметра client лежит параметр address, внутри которого есть следующие параметры:

transactions.addTransactionProduct: Добавление товара в чек
Пример запроса:

<?php
$url = 'https://joinposter.com/api/transactions.addTransactionProduct'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$transaction = [
    'spot_id'        => 1,
    'spot_tablet_id' => 1,
    'transaction_id' => 1950,
    'product_id'     => 112,
    'modification'   => '[{"m":19,"a":1}]',
];

$data = sendRequest($url, 'post', $transaction);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":{  
    "transaction_product":10990
  }
}
Copy to clipboardErrorCopied
Метод добавляет товар в чек.

HTTP запрос
POST https://joinposter.com/api/transactions.addTransactionProduct

POST-параметры запроса transactions.addTransactionProduct
Параметр	Описание
spot_id	ID заведения
spot_tablet_id	ID кассы
transaction_id	ID чека
product_id	ID товара или тех. карты
modificator_id	ID модификации товара, по умолчанию не передаётся
modification	Модификатор тех. карты, по умолчанию не передаётся
price	Стоимость товара или тех. карты, если она должна отличаться от базовой, по умолчанию не передаётся
time	Время операции в формате microtime, по умолчанию принимает текущее время
guest_number	Номер гостя, используется для распределения товара между гостями в рамках одного чека, по умолчанию не передаётся
Внутри параметра modification должна быть JSON строка. JSON должен состоять из массива объектов, где в каждом объекте должны быть следующие параметры:

Параметр	Описание
m	ID модификатора тех. карты
a	Количество модификации тех. карты
Параметры ответа transactions.addTransactionProduct
transactions.createTransaction: Создание чека
Пример запроса:

<?php
$url = 'https://joinposter.com/api/transactions.createTransaction'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$transaction = [
    'spot_id'        => 1,
    'spot_tablet_id' => 1,
    'table_id'       => 1,
    'user_id'        => 3,
    'guests_count'   => 2,
];

$data = sendRequest($url, 'post', $transaction);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":{  
    "transaction_id":1950,
    "transaction_tablet_id":1508850241000
  }
}
Copy to clipboardErrorCopied
Метод создаёт чек.

HTTP запрос
POST https://joinposter.com/api/transactions.createTransaction

POST-параметры запроса transactions.createTransaction
Параметр	Описание
spot_id	ID заведения в котором нужно создать чек
spot_tablet_id	ID кассы в котором нужно создать чек
table_id	ID стола
user_id	ID сотрудника
guests_count	Количество гостей за столом
service_mode	Опциональный параметр, по умолчанию service_mode = 1. Тип заказа: 1 — в заведении, 2 — навынос, 3 — доставка
time	Время операции в формате microtime, по умолчанию принимает текущее время
Параметры ответа transactions.createTransaction
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит объект, внутри которого есть следующие параметры:

transactions.changeTransactionProductCount: Изменение количества товара в чеке
Пример запроса:

<?php
$url = 'https://joinposter.com/api/transactions.changeTransactionProductCount'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$transaction = [
    'spot_id'        => 1,
    'spot_tablet_id' => 1,
    'transaction_id' => 1950,
    'product_id'     => 112,
    'modification'   => '[{"m":19,"a":1}]',
    'count'          => 2,
];

$data = sendRequest($url, 'post', $transaction);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":{  
    "err_code":0
  }
}
Copy to clipboardErrorCopied
Метод изменяет количество товара в чеке.

HTTP запрос
POST https://joinposter.com/api/transactions.changeTransactionProductCount

POST-параметры запроса transactions.changeTransactionProductCount
Параметр	Описание
spot_id	ID заведения
spot_tablet_id	ID кассы
transaction_id	ID чека
product_id	ID товара или тех. карты
modificator_id	ID модификации товара, по умолчанию не передаётся
modification	Модификатора тех. карты, по умолчанию не передаётся
count	Количество товара или тех. карты
time	Время операции в формате microtime, по умолчанию принимает текущее время
guest_number	Номер гостя, используется для распределения товара между гостями в рамках одного чека, по умолчанию не передаётся
Внутри параметра modification должна быть JSON строка. JSON должен состоять из массива объектов, где в каждом объекте должны быть следующие параметры:

Параметр	Описание
m	ID модификатора тех. карты
a	Количество модификатора тех. карты
Параметры ответа transactions.changeTransactionProductCount
transactions.removeTransactionProduct: Удалить товар из чека
Пример запроса:

<?php
$url = 'https://joinposter.com/api/transactions.removeTransactionProduct'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$transaction = [
    'spot_id'        => 1,
    'spot_tablet_id' => 1,
    'transaction_id' => 1950,
    'product_id'     => 113,
];

$data = sendRequest($url, 'post', $transaction);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":{  
    "err_code":0
  }
}
Copy to clipboardErrorCopied
Метод удаляет товар из чека.

HTTP запрос
POST https://joinposter.com/api/transactions.removeTransactionProduct

POST-параметры запроса transactions.removeTransactionProduct
Параметр	Описание
spot_id	ID заведения
spot_tablet_id	ID кассы
transaction_id	ID чека
product_id	ID товара или тех. карты
modificator_id	ID модификации товара, по умолчанию не передаётся
modification	Модификатора тех. карты, по умолчанию не передаётся
time	Время операции в формате microtime, по умолчанию принимает текущее время
Внутри параметра modification должна быть JSON строка. JSON должен состоять из массива объектов, где в каждом объекте должны быть следующие параметры:

Параметр	Описание
m	ID модификации тех. карты
a	Количество модификации тех. карты
Параметры ответа transactions.removeTransactionProduct
transactions.changeClient: Добавление клиента в чек
Пример запроса:

<?php
$url = 'https://joinposter.com/api/transactions.changeClient'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$transaction = [
    'spot_id'        => 1,
    'spot_tablet_id' => 1,
    'transaction_id' => 1950,
    'client_id'      => 3,
];

$data = sendRequest($url, 'post', $transaction);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":{  
    "err_code":0
  }
}
Copy to clipboardErrorCopied
Метод добавляет клиента в чек.

HTTP запрос
POST https://joinposter.com/api/transactions.changeClient

POST-параметры запроса transactions.changeClient
Параметр	Описание
spot_id	ID заведения
spot_tablet_id	ID кассы
transaction_id	ID чека
client_id	ID клиента
time	Время операции в формате microtime, по умолчанию принимает текущее время
Параметры ответа transactions.changeClient
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит объект, внутри которого есть следующие параметры:

transactions.changeComment: Добавление комментария в чек
Пример запроса:

<?php
$url = 'https://joinposter.com/api/transactions.changeComment'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$transaction = [
    'spot_id'        => 1,
    'spot_tablet_id' => 1,
    'transaction_id' => 1950,
    'comment'        => 'День рождения',
];

$data = sendRequest($url, 'post', $transaction);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":{  
    "err_code":0
  }
}
Copy to clipboardErrorCopied
Метод добавляет комментарий в чек.

HTTP запрос
POST https://joinposter.com/api/transactions.changeComment

POST-параметры запроса transactions.changeComment
Параметр	Описание
spot_id	ID заведения
spot_tablet_id	ID кассы
transaction_id	ID чека
comment	Комментарий к чеку
time	Время операции в формате microtime, по умолчанию принимает текущее время
Параметры ответа transactions.changeComment
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит объект, внутри которого есть следующие параметры:

transactions.changeFiscalStatus: Изменение фискального статуса чека
Пример запроса:

<?php
$url = 'https://joinposter.com/api/transactions.changeFiscalStatus'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$postData = [
    'transaction_id' => 1322,
    'products' => [
        [
            'product_id' => 120,
            'promotion_id' => 2,
            'modification_id' => 24,
            'count' => 3,   
        ],
        [
            'product_id' => 122,
            'promotion_id' => 0,
            'modification_id' => 0,
            'count' => 0.350,   
        ],
    ],
];

$data = sendRequest($url, 'post', $postData);
Copy to clipboardErrorCopied
Пример ответа:

{
   "response":{
      "err_code":0
   }
}
Copy to clipboardErrorCopied
Метод меняет статус печати фискального чека на "чек напечатан". Если передается параметр fiscal_return то статус меняется на "напечатан фискальный возврат".

HTTP запрос
POST https://joinposter.com/api/transactions.changeFiscalStatus

POST-параметры запроса transactions.changeFiscalStatus
Параметр	Описание
transaction_id	ID чека
fiscal_return	Признак, что проводится фискальный возврат: false — печать фискального чека, true — фискальный возврат. Опциональный параметр, по умолчанию принимает false.
time	Опциональный параметр, время операции в формате microtime. По умолчанию принимает текущее время.
Внутри параметра products лежит объект, внутри которого есть следующие параметры:

Параметр	Описание
product_id	ID товара или тех. карты
modification_id	ID модификации товара или тех. карты в чеке
promotion_id	ID акции примененной к товару или тех. карте
count	Количество напечатанных на фискальном регистраторе товаров
Параметры ответа
transactions.closeTransaction: Закрытие чека
Пример запроса:

<?php
$url = 'https://joinposter.com/api/transactions.closeTransaction'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$transaction = [
    'spot_id'        => 1,
    'spot_tablet_id' => 1,
    'transaction_id' => 1950,
    'payed_cash'     => 1000,
    "acquirer_payments" => [
        {
            "amount": 1660.11,
            "bank_acquirer": "CREDIT AGRICOLE BANK JSC",
            "payment_system_name": "liqpay",
            "pan": "544535*51",
            "auth_code": "461384",
            "rrn": "461386",
            "terminal_id": "414963",
            "company_code": "34554363",
            "payment_system_method": "cardTransfer"
        }, 
        {
            "amount": 1660.00,
            "bank_acquirer": "Private 24",
            "payment_system_name": "liqpay",
            "pan": "544535*50",
            "auth_code": "461386",
            "rrn": "461386",
            "terminal_id": "414963",
            "company_code": "34554363"
        }
    ]
];

$data = sendRequest($url, 'post', $transaction);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":{  
    "err_code":0
  }
}
Copy to clipboardErrorCopied
Метод закрывает чек.

HTTP запрос
POST https://joinposter.com/api/transactions.closeTransaction

POST-параметры запроса transactions.closeTransaction
Параметр	Описание
spot_id	ID заведения
spot_tablet_id	ID кассы
transaction_id	ID чека
payed_cash	Сумма оплаты наличным расчётом
payed_card	Сумма оплаты безналичным расчётом
payed_cert	Сумма оплаты сертификатом
tip_included	Включить % за обслуживание: 1 - включать, 2 - не включать
tip_sum	Сумма % за обслуживание
reason	Причина закрытия чека без оплаты: 1 — гость ушел, 2 — за счёт заведения, 3 — ошибка официанта. Обязательное поле для закрытия чека без оплаты, сумма всех оплат должна быть равна нулю. По умолчанию не передаётся.
print_fiscal	Печатать фискального чека: 0 — не печатать, 1 — печатать. По умолчанию принимает 0.
time	Время операции в формате microtime, по умолчанию принимает текущее время
payment_method_id	ID кастомного метода оплаты
Внутри параметра acquirer_payments (учитывается только если оплата проводится безналичным расчётом payed_card) должен быть массив, в каждом элементе которого должны быть следующие параметры:

Параметр	Описание
amount	Сумма оплаты наличными (обязательно с точностью до сотых)
bank_acquirer	Наименование банка
payment_system_name	Наименование платёжной системы
pan	Реквизиты ЭПС
auth_code	Код авторизации
rrn	Идентификатор транзакции, предоставляемый эквайером и идентифицирующий транзакцию в платёжной системе
terminal_id	Идентификатор платёжного устройства
company_code	Для ФОП это — inn, для ООО это — ЕДРПОУ (поле необязательное — учитывается только если включена опция «Одновременно работать с несколькими РРО в заведении».)
payment_system_method	Опциональный параметр, тип платежной системи: internetAcquiring, cardTransfer, cardPayment
Параметры ответа transactions.closeTransaction
transactions.removeTransaction: Удаление чека
Пример запроса:

<?php
$url = 'https://joinposter.com/api/transactions.removeTransaction'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$transaction = [
    'spot_tablet_id' => 1,
    'transaction_id' => 1950,
    'user_id'        => 3,
];

$data = sendRequest($url, 'post', $transaction);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":{  
    "err_code":0
  }
}
Copy to clipboardErrorCopied
Метод удаляет чек.

HTTP запрос
POST https://joinposter.com/api/transactions.removeTransaction

POST-параметры запроса transactions.removeTransaction
Параметр	Описание
spot_tablet_id	ID кассы
transaction_id	ID чека
user_id	ID сотрудника
time	Время операции в формате microtime, по умолчанию принимает текущее время
Параметры ответа transactions.removeTransaction
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит объект, внутри которого есть следующие параметры:

transactions.updateTransaction: Изменить заказ на доставку
Пример запроса:

<?php
$url = 'https://joinposter.com/api/transactions.updateTransaction'
  . '?token=687409:4164553abf6a031302898da7800b59fb';

$transaction = [
    'spot_id'           => 1,
    'spot_tablet_id'    => 1,
    'transaction_id'    => 1978,
    'courier_id'        => 12,
    'processing_status' => 40,
    'comment'           => 'comment',
];

$data = sendRequest($url, 'post', $transaction);
Copy to clipboardErrorCopied
Пример запроса для изменения суммы доставки:

<?php
$url = 'https://joinposter.com/api/transactions.updateTransaction'
  . '?token=687409:4164553abf6a031302898da7800b59fb';

$transaction = [
    'spot_id'           => 1,
    'spot_tablet_id'    => 1,
    'transaction_id'    => 1978,
    'delivery_price'    => 55.75,
];

$data = sendRequest($url, 'post', $transaction);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":{  
    "error_code":0
  }
}
Copy to clipboardErrorCopied
Метод изменяет параметры заказа на доставку.

HTTP запрос
POST https://joinposter.com/api/transactions.updateTransaction

POST-параметры запроса transactions.updateTransaction
Параметр	Описание
spot_id	ID заведения
spot_tablet_id	ID терминала
transaction_id	ID чека
courier_id	ID курьрера
processing_status	Статус заказа. 40 - в пути, 50 - доставлен
comment	Комментарий к чеку
POST-параметры запроса transactions.updateTransaction для изменения суммы доставки
transactions.changeProductComment: Изменить комментарий к товару в чеке
Пример запроса:

<?php
$url = 'https://joinposter.com/api/transactions.changeProductComment'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$transaction = [
    'spot_id'        => 1,
    'spot_tablet_id' => 1,
    'transaction_id' => 1950,
    'product_id'     => 112,
    'modification'   => '[{"m":19,"a":1}]',
    'comment'        => 'Без лука',
];

$data = sendRequest($url, 'post', $transaction);
Copy to clipboardErrorCopied
Пример ответа:

{
   "response":{
      "err_code":0
   }
}
Copy to clipboardErrorCopied
Метод редактирует комментарий к товару в заказе.

HTTP запрос
POST https://joinposter.com/api/transactions.changeProductComment

POST-параметры запроса transactions.changeProductComment
Параметр	Описание
spot_id	ID заведения
spot_tablet_id	ID терминала
transaction_id	ID чека
product_id	ID товара или тех. карты
modificator_id	ID модификации товара, по умолчанию не передаётся
modification	Модификаторы тех. карты, по умолчанию не передаётся
comment	Комментарий, который будет добавлен к товару
time	Время операции в формате microtime, по умолчанию принимает текущее время
guest_number	Номер гостя, используется для распределения товара между гостями в рамках одного чека, по умолчанию не передаётся
Внутри параметра modification должна быть JSON строка. JSON должен состоять из массива объектов, где в каждом объекте должны быть следующие параметры:

Параметр	Описание
m	ID модификатора тех. карты
a	Количество модификации тех. карты
Параметры ответа transactions.changeProductComment
spots.getSpots: Список заведений
Пример запроса:

<?php
$url = 'https://joinposter.com/api/spots.getSpots'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{  
   "response":[  
      {  
         "spot_id":1,
         "name":"Кафе на Полянке",
         "address":"Киев, ул. Б.Полянка 44"
      },
      {  
         "spot_id":2,
         "name":"Львовська Кав'ярня",
         "address":"Львов, пл. Ринок, 11"
      }
   ]
}
Copy to clipboardErrorCopied
Метод возвращает список заведений.

HTTP запрос
GET https://joinposter.com/api/spots.getSpots

Параметры ответа spots.getSpots
Параметр	Описание
response	Массив объектов
Внутри параметра response лежит массив, в каждом элементе которого есть следующие параметры:

Параметр	Описание
spot_id	ID заведения
name	Название заведения
address	Адрес заведения
📝 Изменить документацию

spots.getSpot: Свойства заведения
Пример запроса:

<?php
$url = 'https://joinposter.com/api/spots.getSpot'
 . '?token=687409:4164553abf6a031302898da7800b59fb'
 . '&spot_id=1';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{  
   "response":{  
      "spot_id":1,
      "name":"Кафе на Полянке",
      "address":"Київ, ул. Б.Полянка 44"
   }
}
Copy to clipboardErrorCopied
Метод возвращает свойства заведения.

HTTP запрос
GET https://joinposter.com/api/spots.getSpot

GET-параметры запроса spots.getSpot
Параметр	Описание
spot_id	Обязательный параметр, обозначает ID заведения
Параметры ответа spots.getSpot
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит объект, в каждом элементе которого есть следующие параметры:

spots.getSpot: Свойства заведения
Пример запроса:

<?php
$url = 'https://joinposter.com/api/spots.getSpot'
 . '?token=687409:4164553abf6a031302898da7800b59fb'
 . '&spot_id=1';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{  
   "response":{  
      "spot_id":1,
      "name":"Кафе на Полянке",
      "address":"Київ, ул. Б.Полянка 44"
   }
}
Copy to clipboardErrorCopied
Метод возвращает свойства заведения.

HTTP запрос
GET https://joinposter.com/api/spots.getSpot

GET-параметры запроса spots.getSpot
Параметр	Описание
spot_id	Обязательный параметр, обозначает ID заведения
Параметры ответа spots.getSpot
Параметр	Описание
response	Объект ответа
Внутри параметра response лежит объект, в каждом элементе которого есть следующие параметры:

spots.getTableHallTables: Список столов
Пример запроса:

<?php
$url = 'https://joinposter.com/api/spots.getTableHallTables'
 . '?token=687409:4164553abf6a031302898da7800b59fb'
 . '&spot_id=1'
 . '&hall_id=3'
 . '&without_deleted=1';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":[  
    {  
      "table_id":"3",
      "table_num":"1",
      "table_title":"Возле барной стойки",
      "spot_id":"1",
      "table_shape":"square",
      "hall_id":"1",
      "table_x":"9",
      "table_y":"12",
      "table_height":"4",
      "table_width":"8",
      "is_deleted":"0"
    },
    {  
      "table_id":"4",
      "table_num":"2",
      "table_title":"Дальний",
      "spot_id":"1",
      "table_shape":"circle",
      "hall_id":"1",
      "table_x":"15",
      "table_y":"11",
      "table_height":"10",
      "table_width":"13",
      "is_deleted":"0"
    }
  ]
}
Copy to clipboardErrorCopied
Метод возвращает список столов.

HTTP запрос
GET https://joinposter.com/api/spots.getTableHallTables

GET-параметры запроса spots.getTableHallTables
Параметр	Описание
spot_id	ID заведения, по умолчанию не передаётся
hall_id	ID зала, по умолчанию не передаётся
without_deleted	Признак, возвращать ли без удалённых столов: 0 — с удалёнными столами, 1 — без удалённых столов. По умолчанию принимает 0.
Параметры ответа spots.getTableHallTables
Параметр	Описание
response	Массив объектов
Внутри параметра response лежит массив, в каждом элементе которого есть следующие параметры:

finance: Финансы

Методы для работы с разделом «Финансов». Все методы данного раздела начинаются с «finance».

finance.closeCashShift: Закрить кассовую смену
finance.createAccount: Создать новый счет
finance.createCashShiftTransaction: Создать транзакцию кассовой смены
finance.createCategory: Создать новую финансовую категорию
finance.createTax: Создать налог
finance.createTransactions: Создать новую транзакцию
finance.getAccount: Свойства счета
finance.getAccounts: Получить счета
finance.getCashShifts: Список кассовых смен
finance.getCashShiftTransaction: Свойства транзакции кассовой смены
finance.getCashShiftTransactions: Список транзакций кассовой смены
finance.getCategories: Получить список категорий
finance.getReport: Отчет по категориям
finance.getTax: Свойства налога
finance.getTaxes: Список налогов
finance.getTransaction: Свойства транзакции
finance.getTransactions: Получить все транзакции
finance.openCashShift: Открытие кассовой смены
finance.removeCashShiftTransaction: Удаление транзакции кассовой смены
finance.removeTax: Удаление налога
finance.set1cCashShiftTransactionId: Изменение id транзакций в системе 1С
finance.set1cTransactionId: Изменение id транзакций в системе 1С
finance.updateAccount: Изменение счета
finance.updateCashShiftTransaction: Изменение свойств транзакции кассовой смены
finance.updateCategory: Изменение финансовой категории
finance.updateTax: Изменение свойств налога
finance.updateTransactions: Изменение транзакции 📝 Изменить документацию
 Previous
Заведения
Next 
Доступ
access: Доступ

Методы по работе с разделом доступ. Все методы данного раздела начинаются с «access». Список доступных методов:

access.getEmployees: Список сотрудников
access.createEmployee: Создать сотрудника
access.updateEmployee: Изменить свойства сотрудника
access.getTablets: Список касс
access.updateTablet: Изменить свойства кассы
access.getSpots: Список заведений
access.updateSpot: Изменить свойства заведения
📝 Изменить документацию

 Previous
Финансы
Next 
Франшизы
franchise: Франшизы

Методы для работы с франшизами. Все методы данного раздела начинаются с franchise. Список доступных методов:

franchise.getSpots: Получить заведения во франчайзи по всей франшизе
📝 Изменить документацию

 Previous
Доступ
Next 
Настройки аккаунта
settings.getAllSettings: Настройки аккаунта
Пример запроса:

<?php
$url = 'https://joinposter.com/api/settings.getAllSettings'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$data = sendRequest($url);
Copy to clipboardErrorCopied
Пример ответа:

{
    "response": {
        "COMPANY_ID": "demo",
        "FIZ_ADRESS_CITY": "joinposter.com",
        "FIZ_ADRESS_PHONE": "380981111111",
        "uses_tables": 1,
        "uses_cash_shifts": 1,
        "uses_taxes": 1,
        "uses_multiprice": 0,
        "tip_amount": 10,
        "tip_tax_id": 3,
        "uses_bookkeeping": 1,
        "uses_ipay": 0,
        "uses_manufacturing": 0,
        "uses_quick_waiter": 0,
        "company_name": "Демо-версия Poster",
        "company_type": 1,
        "timezones": "Europe/Kiev",
        "logo": "/upload/pos_cdb_4/icon.png",
        "lang": "ru",
        "pos_phone": "380981111111",
        "analytics_plus_time": 0,
        "uses_fiscality": 0,
        "print_fiscal_by_default": 0,
        "currency": {
            "currency_id": 1,
            "currency_name": "Гривна",
            "currency_code": "грн.",
            "currency_symbol": "₴",
            "currency_code_iso": "UAH"
        },
        "email": "root@joinposter.com",
        "name": "Demo"
    }
}
Copy to clipboardErrorCopied
Метод возвращает данные по настройкам аккаунта.

HTTP GET запрос
https://joinposter.com/api/settings.getAllSettings

Параметры ответа settings.getAllSettings
Параметр	Описание
COMPANY_ID	Название аккаунта
FIZ_ADRESS_CITY	Адрес заведения
FIZ_ADRESS_PHONE	Телефон заведения
uses_tables	Используется ли карта столов: 0 — не используется, 1 — используется
uses_cash_shifts	Используются ли кассовые смены: 0 — не используются, 1 — используются
uses_taxes	Используются ли налоги: 0 — не используются, 1 — используются
uses_multiprice	Используются ли разные цены в разных заведениях: 0 — не используются, 1 — используются
tip_amount	Процент за обслуживание
tip_tax_id	Налог процента за обслуживание
uses_bookkeeping	Используется ли бухгалтерия: 0 — не используется, 1 — используется
uses_manufacturing	Используется ли производство: 0 — не используется, 1 — используется
uses_quick_waiter	Используется ли быстрая смена официанта: 0 — не используется, 1 — используется
company_name	Название заведения
company_type	Тип заведения: 1 — кафе, 2 — магазин
timezones	Часовой пояс
logo	Ссылка на логотип аккаунта
lang	Язык в формате ISO 639. Украинский язык обозначается как ua.
pos_phone	Телефон владельца аккаунта
analytics_plus_time	Бизнес-время окончания работы заведения
uses_fiscality	Используется ли фискализация: 0 — не используется, 1 — используется
delivery_tax_id	Налог доставки
print_fiscal_by_default	Печатаются ли фискальные чеки по умолчанию: 0 — не печатаются, 1 — печатаются
email	Эл. почта владельца аккаунта
name	Имя владельца аккаунта
currency	Валюта аккаунта
Внутри элемента currency лежит массив, в каждом элементе которого есть следующие свойства:

Параметр	Описание
currency_id	ID валюты в Poster
currency_name	Название валюты
currency_code	Код валюты на терминале
currency_symbol	Unicode символ валюты, для рубля, драма и маната приходит HTML который на терминале отобразиться как иконка валюты
currency_code_iso	Цифровой код валюты по стандарту ISO 4217
📝 Изменить документацию

settings.changeSettings: Изменение настроек клиентского аккаунта
Пример запроса:

<?php
$url = 'https://joinposter.com/api/settings.changeSettings'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$settings = [
    'uses_taxes'              => 1,
    'uses_cash_shifts'        => 0,
    'uses_fiscality'          => 0,
    'print_fiscal_by_default' => 0,
    'timezones'               => 'America/Mexico_City',
];

$data = sendRequest($url, 'post', $settings);
Copy to clipboardErrorCopied
Пример ответа:

{  
  "response":true
}
Copy to clipboardErrorCopied
Метод изменяет свойства настроек клиентского аккаунта.

HTTP POST запрос
https://joinposter.com/api/settings.changeSettings

POST-параметры запроса settings.changeSettings
Параметр	Описание
uses_taxes	Признак, использовать ли налоги: 0 — не использовать, 1 — использовать. По умолчанию не передаётся.
uses_cash_shifts	Признак, использовать ли кассовые смены: 0 — не использовать, 1 — использовать. По умолчанию не передаётся.
uses_fiscality	Признак, использовать ли фискализацию: 0 — не использовать, 1 — использовать. По умолчанию не передаётся.
print_fiscal_by_default	Признак, печатать ли фискальный чек по умолчанию: 0 — не печатать, 1 — печатать. По умолчанию не передаётся.
timezones	Часовой пояс. По умолчанию не передаётся.
Параметры ответа settings.changeSettings
Параметр	Описание
response	true, если свойства настроек клиентского аккаунта успешно изменены
📝 Изменить документацию

settings.getOrderSources: Свойства источников заказа
Пример запроса:

<?php
$url = 'https://joinposter.com/api/settings.getOrderSources'
 . '?token=687409:4164553abf6a031302898da7800b59fb';

$data = sendRequest($url);
Copy to clipboardErrorCopied
cURL пример:

curl -X GET \
  'https://joinposter.com/api/settings.getOrderSources?token=687409:4164553abf6a031302898da7800b59fb' \
Copy to clipboardErrorCopied
Пример ответа:

{
      "response": [
        {
          "id": 1,
          "name": "В заведении",
          "visible": 1,
          "type": 0
        },
        {
          "id": 2,
          "name": "С собой",
          "visible": 1,
          "type": 0
        },
        {
          "id": 3,
          "name": "Bold food",
          "visible": 1,
          "type": 1
        }
      ]
}
Copy to clipboardErrorCopied
Метод возвращает свойства источников заказа в разделе настроек.

HTTP GET запрос
GET https://joinposter.com/api/settings.getOrderSources

Параметры ответа settings.getOrderSources
Параметр	Описание
response	Объект ответа
Внутри response лежит объект c параметрами:

Параметр	Описание
id	ID источника заказа
name	Название источника заказа
visible	Отображать на POS-терминале. 1 - да, 0 - нет.
type	Тип: 0 - создан по умолчанию, 1 - создан пользователем.
📝 Изменить документацию

settings.getOrderSource: Свойства источника заказа
Пример запроса:

<?php
$url = 'https://joinposter.com/api/settings.getOrderSource'
 . '?token=687409:4164553abf6a031302898da7800b59fb'
 . '&id=3';

$data = sendRequest($url);
Copy to clipboardErrorCopied
cURL пример:

curl -X GET \
  'https://joinposter.com/api/settings.getOrderSource?token=687409:4164553abf6a031302898da7800b59fb&id=3' \
Copy to clipboardErrorCopied
Пример ответа:

{
  "response":
    {
      "id": 3,
      "name": "Bold food",
      "visible": 1,
      "type": 1
    }
}
Copy to clipboardErrorCopied
Метод возвращает свойства источника заказа в разделе настроек.

HTTP GET запрос
GET https://joinposter.com/api/settings.getOrderSource

GET-параметры запроса settings.getOrderSource
Параметр	Описание
id	Обязательный параметр, id источника заказа
Параметры ответа settings.getOrderSource
Параметр	Описание
response	Объект ответа
Внутри response лежит объект c параметрами:

settings.getPaymentMethods: Свойства методов оплаты
Пример запроса:

<?php
$url = 'https://joinposter.com/api/settings.getPaymentMethods'
 . '?token=687409:4164553abf6a031302898da7800b59fb'
 . '&money_type=2'
 . '&payment_type=7';

$data = sendRequest($url);
Copy to clipboardErrorCopied
cURL пример:

curl -X GET \
  'https://joinposter.com/api/settings.getPaymentMethods?token=687409:4164553abf6a031302898da7800b59fb&money_type=2&payment_type=7' \
Copy to clipboardErrorCopied
Пример ответа:

{
  "response": [
    {
      "payment_method_id": 2,
      "title": "Карта",
      "icon": "/i/manage/payment_methods/card.png",
      "color": "",
      "money_type": 2,
      "payment_type": 2,
      "is_active": 1,
      "percents_acquiring": [
        {
          "spot_id": 1,
          "percent_acquiring": 0.0
        }
      ]
    },
    {
      "payment_method_id": 6,
      "title": "menu.ua",
      "icon": "/i/manage/payment_methods/menu_ua.png",
      "color": "",
      "money_type": 2,
      "payment_type": 7,
      "is_active": 0,
      "percents_acquiring": [
        {
          "spot_id": 1,
          "percent_acquiring": 0.0
        }
      ]
    }
  ]
}
Copy to clipboardErrorCopied
Метод возвращает свойства методов оплаты в разделе настроек.

HTTP GET запрос
GET https://joinposter.com/api/settings.getPaymentMethods

GET-параметры запроса settings.getPaymentMethods
Параметр	Описание
money_type	Необязательный параметр, тип оплаты: 1 - наличные, 2 - карта, 3 - другой
payment_type	Необязательный параметр, тип метода оплаты: 1 — наличные, 2 — безналичные, 4 — сертификат, 5 — депозит, 7 — пользовательский
Параметры ответа settings.getPaymentMethods
Параметр	Описание
response	Объект ответа
Внутри response лежит массив объектов со следующими параметрами:

settings.getPaymentMethod: Свойства метода оплаты
Пример запроса:

<?php
$url = 'https://joinposter.com/api/settings.getPaymentMethod'
 . '?token=687409:4164553abf6a031302898da7800b59fb'
 . '&payment_method_id=3';

$data = sendRequest($url);
Copy to clipboardErrorCopied
cURL пример:

curl -X GET \
  'https://joinposter.com/api/settings.getPaymentMethod?token=687409:4164553abf6a031302898da7800b59fb&payment_method_id=3' \
Copy to clipboardErrorCopied
Пример ответа:

{
  "response":
    {
      "payment_method_id": 3,
      "title": "Карта",
      "icon": "/i/manage/payment_methods/card.png",
      "color": "",
      "money_type": 2,
      "payment_type": 2,
      "is_active": 1,
      "percents_acquiring": [
        {
          "spot_id": 1,
          "percent_acquiring": 0.0
        }
      ]
    }
}
Copy to clipboardErrorCopied
Метод возвращает свойства метода оплаты в разделе настроек.

HTTP GET запрос
GET https://joinposter.com/api/settings.getPaymentMethod

GET-параметры запроса settings.getPaymentMethod
Параметр	Описание
payment_method_id	Обязательный параметр, ID метода оплаты
Параметры ответа settings.getPaymentMethod
Параметр	Описание
response	Объект ответа
Внутри response лежит объект c параметрами:

application: Приложение

Методы для работы с вашим приложением в Poster. Все методы данного раздела начинаются с «application». Список доступных методов:

access.setEntityExtras: Изменить дополнительные данные сущности
access.deleteEntityExtras: Удалить дополнительные данные сущности
access.getInfo: Получить данные приложения
access.getInfo: Изменить тарифный план приложения
📝 Изменить документацию

 Previous
Настройки аккаунта
