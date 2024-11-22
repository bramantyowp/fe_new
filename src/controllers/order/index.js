const Joi = require("joi");
const express = require("express");

const BaseController = require("../base");
const OrderModel = require("../../models/order");
const CarsModel = require("../../models/cars");
const { authorize, checkRole } = require("../../middlewares/authorization");
const ValidationError = require("../../helpers/errors/validation");
const { createInvoice } = require("../../helpers/createInvoice");
const router = express.Router();

const order = new OrderModel();
const cars = new CarsModel();

const orderSchema = Joi.object({
  car_id: Joi.number().required(),
  start_time: Joi.date().required(),
  end_time: Joi.date().required(),
  is_driver: Joi.boolean().required(),
  promo: Joi.string(),
  payment_method: Joi.string().required(),
});

const PROMOS = [{
  title: "NEWUSER",
  discount: 25,
  expired_date: "25/11/2024"
},
{
  title: "SEWASUKASUKA",
  discount: 15,
  expired_date: "20/11/2024"
}]

class OrderController extends BaseController {
  constructor(model) {
    super(model);
    router.get("/", this.getAll);
    router.post("/", this.validation(orderSchema), authorize, this.create);
    router.get("/myorder", authorize, this.getMyOrder);
    router.get("/:id", authorize, this.get);
    router.put("/:id", authorize, this.updateOrder);
    router.get("/:id/invoice", authorize, this.downloadInvoice);
    router.put("/:id/payment", authorize, this.payment);
    router.get("/:id/cancel", authorize, this.cancelOrder)
    // router.put("/:id", this.validation(carSchema), authorize, checkRole(['admin']), this.update);
    // router.delete("/:id", this.delete);
  }

  getMyOrder = async (req, res, next) => {
    req.query.filter = {
      user_id: req.user.id
    }
    return this.getAll(req, res, next)
  }

  // mengubah create
  create = async (req, res, next) => {
    try {
      const getCars = await cars.getOne({
        where: {
          id: req.body.car_id,
          isAvailable: true,
        },
        select: {
          isDriver: true,
          price: true,
        },
      });

      if (!getCars)
        return next(new ValidationError("Car not found or is not available!"));

      if (getCars.isDriver && !req.body.is_driver) {
        return next(new ValidationError("Mobil ini wajib menggunakan supir!"));
      }

      const startTime = new Date(req.body.start_time);
      const endTime = new Date(req.body.end_time);
      let total =
        getCars.price * ((endTime - startTime) / 1000 / 60 / 60 / 24);

      if (req.body.promo) {
        const selectedPromo = PROMOS.find((promo) => promo.title === req.body.promo)
        if (!selectedPromo || selectedPromo.expired_date < new Date())
          return next(new ValidationError("Promo not found or is not available!"));

        total = total * ((100 - selectedPromo.discount) / 100)
      }

      const [result, carUpdate] = await this.model.transaction([
        this.model.set({
          start_time: startTime,
          end_time: endTime,
          is_driver: req.body.is_driver,
          status: "pending",
          createdBy: req.user.fullname,
          updatedBy: req.user.fullname,
          payment_method: req.body.payment_method,
          promo_code: req.body.promo,
          total,
          cars: {
            connect: {
              id: req.body.car_id,
            },
          },
          users: {
            connect: {
              id: req.user.id,
            },
          },
        }),
        cars.update(req.body.car_id, { isAvailable: false }),
      ]);

      return res.status(200).json(
        this.apiSend({
          code: 200,
          status: "success",
          message: "Order created successfully",
          data: result,
        })
      );
    } catch (error) {
      return next(error);
    }
  };

  updateOrder = async (req, res, next) => {
    const { id } = req.params;
    try {
      const getCars = await cars.getOne({
        where: {
          id: req.body.car_id,
        },
        select: {
          isDriver: true,
          price: true,
        },
      });

      if (getCars.isDriver && !req.body.is_driver) {
        return next(new ValidationError("Mobil ini wajib menggunakan supir!"));
      }

      const startTime = new Date(req.body.start_time);
      const endTime = new Date(req.body.end_time);
      let total =
        getCars.price * ((endTime - startTime) / 1000 / 60 / 60 / 24);

      if (req.body.promo) {
        const selectedPromo = PROMOS.find((promo) => promo.title === req.body.promo)
        if (!selectedPromo || selectedPromo.expired_date < new Date())
          return next(new ValidationError("Promo not found or is not available!"));

        total = total * ((100 - selectedPromo.discount) / 100)
      }

      const result = await this.model.update(id, {
        start_time: startTime,
        end_time: endTime,
        is_driver: req.body.is_driver,
        updatedBy: req.user.fullname,
        payment_method: req.user.payment_method,
        promo_code: req.body.promo,
        total,
      })

      return res.status(200).json(
        this.apiSend({
          code: 200,
          status: "success",
          message: "Order updated successfully",
          data: result,
        })
      );
    } catch (error) {
      return next(error);
    }
  }

  payment = async (req, res, next) => {
    const { id } = req.params;
    try {
      const { receipt } = req.body;

      const getLastOrderToday = await this.model.count({
        where: {
          createdDt: {
            lte: new Date(),
          },
        }
      });

      const currentDate = new Date();
      const invNumber = `INV/${currentDate.getFullYear()}/${currentDate.getMonth() + 1
        }/${currentDate.getDate()}/${getLastOrderToday}`;

      const orderPaid = await this.model.update(id, {
        order_no: invNumber,
        receipt,
        status: "paid",
      });

      return res.status(200).json(
        this.apiSend({
          code: 200,
          status: "success",
          message: "Order Paid successfully",
          data: orderPaid,
        })
      );
    } catch (error) {
      return next(error);
    }
  };

  cancelOrder = async (req, res, next) => {
    try {
      const order = await this.model.getById(req.params.id)

      if (!order || order.user_id !== req.user.id) // WIP : tambahkan kondisi superadmin & admin bisa cancel order
        return next(new ValidationError("Order not found or is not available!"));

      const getCars = await cars.getById(order.car_id);

      if (!getCars)
        return next(new ValidationError("Car not found or is not available!"));

      await cars.update(order.car_id, {
        isAvailable: true,
      });

      const orderCanceled = await this.model.update(order.id, {
        status: "cancelled",
      });

      return res.status(200).json(
        this.apiSend({
          code: 200,
          status: "success",
          message: "Order canceled successfully",
          data: orderCanceled,
        })
      );

    } catch (error) {
      return next(error);
    }
  }

  downloadInvoice = async (req, res, next) => {
    const { id } = req.params;
    try {
      const order = await this.model.getById(id, {
        select: {
          order_no: true,
          createdDt: true,
          status: true,
          user_id: true,
          start_time: true,
          end_time: true,
          total: true,
          cars: {
            select: {
              id: true,
              name: true,
              price: true,
            },
          },
          users: {
            select: {
              id: true,
              fullname: true,
              address: true
            }
          }
        }
      });

      if (order.status !== "paid") {
        return next(new ValidationError("Order not paid!"));
      }

      createInvoice(order, res);
    } catch (error) {
      return next(error);
    }
  };
}

new OrderController(order);

module.exports = router;
