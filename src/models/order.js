const BaseModel = require("./base");

//inheritance
class OrderModel extends BaseModel {
  constructor() {
    super("order");
    this.select = {
        id: true,
        order_no: true,
        overdue_time: true,
        status: true,
        createdDt: true,
        total: true,
        users: {
          select:{
            fullname: true
          }
        },
        cars:{
          select:{
            name: true
          }
        },
    };
  }
}

module.exports = OrderModel
