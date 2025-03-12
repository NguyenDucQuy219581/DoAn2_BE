const express = require('express')
require('dotenv').config();
const bodyParser = require('body-parser');
const cors = require('cors');
const morgan = require("morgan");
const connection = require("./config/db.config");
const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
// Middleware
app.use(morgan('dev')); // Log request
app.use(cors()); // Kích hoạt CORS

// Lấy danh sách sản phẩm
app.get('/api/products', (req, res) => {
    connection.query('SELECT * FROM products', (err, results) => {
        if (err) return res.status(500).json({ error: 'Lỗi khi lấy danh sách sản phẩm' });
        res.status(200).json(results);
    });
});

app.get('/api/reviews/:productId', async (req, res) => {
    const { productId } = req.params;
    console.log('Request received for product ID:', productId);

    // Validate productId
    if (!productId) {
        console.log('Invalid product ID received');
        return res.status(400).json({
            message: 'ID sản phẩm không hợp lệ',
            success: false
        });
    }

    try {
        console.log('Executing SQL query for product ID:', productId);

        // Kiểm tra kết nối database
        if (!connection) {
            throw new Error('Database connection not established');
        }

        const query = `
            SELECT 
                reviews.ID_Review, 
                reviews.ID_SP, 
                reviews.ID_Users,
                reviews.rating, 
                reviews.comment, 
                reviews.createdAt,
                users.TenUser
            FROM reviews 
            JOIN users ON reviews.ID_Users = users.ID_Users
            WHERE reviews.ID_SP = ?
            ORDER BY reviews.createdAt DESC
        `;

        connection.query(query, [productId], (err, reviews) => {
            if (err) {
                console.error('Error executing query:', err);

                let errorMessage = 'Lỗi server khi lấy đánh giá';
                let statusCode = 500;

                if (err.code === 'ER_NO_SUCH_TABLE') {
                    errorMessage = 'Bảng database không tồn tại';
                } else if (err.code === 'ER_BAD_FIELD_ERROR') {
                    errorMessage = 'Lỗi cấu trúc database';
                } else if (err.code === 'ECONNREFUSED') {
                    errorMessage = 'Không thể kết nối đến database';
                    statusCode = 503;
                }

                return res.status(statusCode).json({
                    success: false,
                    message: errorMessage,
                    error: process.env.NODE_ENV === 'development' ? err.message : undefined
                });
            }

            // Kiểm tra kết quả trả về
            if (!reviews) {
                console.log('No reviews array returned from database');
                return res.status(404).json({
                    message: 'Không tìm thấy đánh giá',
                    success: false
                });
            }

            console.log('Successfully retrieved reviews for product:', productId);
            console.log('Số lượng đánh giá tìm thấy:', reviews.length);

            res.json({
                success: true,
                data: reviews,
                message: 'Lấy đánh giá thành công'
            });
        });

    } catch (error) {
        console.error('Detailed error in fetching reviews:', {
            error: error.message,
            stack: error.stack,
            productId: productId,
            timestamp: new Date().toISOString()
        });

        res.status(500).json({
            success: false,
            message: 'Lỗi server khi lấy đánh giá',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Thêm đánh giá mới
// Thêm đánh giá mới
app.post('/api/reviews', async (req, res) => {
    console.log('Received review request:', req.body);

    const { ID_SP, ID_Users, rating, comment } = req.body;

    // Validation
    if (!ID_SP || !ID_Users || !rating || !comment) {
        console.log('Missing required fields:', { ID_SP, ID_Users, rating, comment });
        return res.status(400).json({
            message: 'Thiếu thông tin cần thiết để gửi đánh giá'
        });
    }

    try {
        // Check if product exists
        connection.query(
            'SELECT ID_SP FROM products WHERE ID_SP = ?',
            [ID_SP],
            (err, products) => {
                if (err) {
                    console.error('Error checking product:', err);
                    return res.status(500).json({
                        message: 'Lỗi server khi kiểm tra sản phẩm'
                    });
                }

                if (products.length === 0) {
                    return res.status(404).json({
                        message: 'Sản phẩm không tồn tại'
                    });
                }

                // Check if user exists
                connection.query(
                    'SELECT ID_Users FROM users WHERE ID_Users = ?',
                    [ID_Users],
                    (err, users) => {
                        if (err) {
                            console.error('Error checking user:', err);
                            return res.status(500).json({
                                message: 'Lỗi server khi kiểm tra người dùng'
                            });
                        }

                        if (users.length === 0) {
                            return res.status(404).json({
                                message: 'Người dùng không tồn tại'
                            });
                        }

                        // Check if review already exists
                        connection.query(
                            'SELECT ID_Review FROM reviews WHERE ID_SP = ? AND ID_Users = ?',
                            [ID_SP, ID_Users],
                            (err, existingReview) => {
                                if (err) {
                                    console.error('Error checking existing review:', err);
                                    return res.status(500).json({
                                        message: 'Lỗi server khi kiểm tra đánh giá hiện có'
                                    });
                                }

                                if (existingReview.length > 0) {
                                    return res.status(400).json({
                                        message: 'Bạn đã đánh giá sản phẩm này rồi'
                                    });
                                }

                                // Insert review
                                connection.query(
                                    `INSERT INTO reviews (ID_SP, ID_Users, rating, comment, createdAt) 
                                     VALUES (?, ?, ?, ?, NOW())`,
                                    [ID_SP, ID_Users, rating, comment],
                                    (err, result) => {
                                        if (err) {
                                            console.error('Error inserting review:', err);
                                            return res.status(500).json({
                                                message: 'Lỗi server khi thêm đánh giá'
                                            });
                                        }

                                        // Get new review details
                                        connection.query(
                                            `SELECT reviews.*, users.TenUser 
                                             FROM reviews 
                                             JOIN users ON reviews.ID_Users = users.ID_Users 
                                             WHERE reviews.ID_Review = ?`,
                                            [result.insertId],
                                            (err, newReview) => {
                                                if (err) {
                                                    console.error('Error fetching new review:', err);
                                                    return res.status(500).json({
                                                        message: 'Lỗi server khi lấy thông tin đánh giá mới'
                                                    });
                                                }

                                                return res.status(201).json({
                                                    message: 'Đánh giá đã được gửi thành công',
                                                    review: newReview[0]
                                                });
                                            }
                                        );
                                    }
                                );
                            }
                        );
                    }
                );
            }
        );
    } catch (error) {
        console.error('Detailed error:', error);
        return res.status(500).json({
            message: 'Lỗi server khi thêm đánh giá',
            error: error.message
        });
    }
});

// Cập nhật đánh giá
// Cập nhật đánh giá
app.put('/api/reviews/:reviewId', (req, res) => {
    const { rating, comment } = req.body;
    const reviewId = req.params.reviewId;

    try {
        connection.query(
            'UPDATE reviews SET rating = ?, comment = ? WHERE ID_Review = ?',
            [rating, comment, reviewId],
            (err, result) => {
                if (err) {
                    console.error('Error updating review:', err);
                    return res.status(500).json({
                        message: 'Lỗi server khi cập nhật đánh giá'
                    });
                }

                if (result.affectedRows === 0) {
                    return res.status(404).json({
                        message: 'Không tìm thấy đánh giá'
                    });
                }

                res.json({
                    message: 'Đánh giá đã được cập nhật thành công'
                });
            }
        );
    } catch (error) {
        console.error('Error updating review:', error);
        res.status(500).json({
            message: 'Lỗi server khi cập nhật đánh giá'
        });
    }
});

// Xóa đánh giá
app.delete('/api/reviews/:reviewId', (req, res) => {
    try {
        connection.query(
            'DELETE FROM reviews WHERE ID_Review = ?',
            [req.params.reviewId],
            (err, result) => {
                if (err) {
                    console.error('Error deleting review:', err);
                    return res.status(500).json({
                        message: 'Lỗi server khi xóa đánh giá'
                    });
                }

                if (result.affectedRows === 0) {
                    return res.status(404).json({
                        message: 'Không tìm thấy đánh giá'
                    });
                }

                res.json({
                    message: 'Đánh giá đã được xóa thành công'
                });
            }
        );
    } catch (error) {
        console.error('Error deleting review:', error);
        res.status(500).json({
            message: 'Lỗi server khi xóa đánh giá'
        });
    }
});

app.get('/api/orders/:userId', (req, res) => {
    const userId = req.params.userId;

    console.log('Received request for User ID:', userId);

    // Ánh xạ trạng thái đơn hàng sang tiếng Việt
    const statusMap = {
        pending: 'Chờ xử lý',
        processing: 'Đang xử lý',
        shipping: 'Đang giao hàng',
        completed: 'Hoàn tất',
        cancelled: 'Đã hủy',
    };

    // Truy vấn lấy thông tin đơn hàng từ cơ sở dữ liệu
    const query = `
      SELECT 
        orderId, 
        DATE_FORMAT(orderDate, '%Y-%m-%d') as orderDate, 
        orderStatus as status, 
        totalAmount,
        shippingAddress
      FROM Orders  -- Đảm bảo tên bảng đúng (Orders hoặc orders)
      WHERE ID_Users = ?  -- Truy vấn theo userId
      ORDER BY orderDate DESC
    `;

    // Sử dụng đối tượng connection đúng cách
    connection.query(query, [userId], function (err, results) {
        if (err) {
            console.error('Database query error:', err.message);
            return res.status(500).json({ error: 'Lỗi khi lấy dữ liệu đơn hàng' });
        }

        console.log('Orders retrieved:', results);

        // Ánh xạ trạng thái và trả về dữ liệu cho client
        const mappedResults = results.map(order => ({
            ...order,
            status: statusMap[order.status] || order.status, // Ánh xạ trạng thái từ cơ sở dữ liệu sang tiếng Việt
        }));

        // Trả kết quả cho client
        res.json(mappedResults);
    });
});

app.get('/api/orders', (req, res) => {
    // Truy vấn cơ sở dữ liệu với callback
    connection.query('SELECT * FROM Orders ORDER BY orderDate DESC', (error, results) => {
        if (error) {
            console.error(error); // Log full error
            return res.status(500).json({
                message: 'Không thể tải danh sách đơn hàng',
                error: error.message
            });
        }
        // Gửi kết quả trả về
        res.json(results);
    });
});

app.delete('/api/orders/:id', (req, res) => {
    const { id } = req.params;

    // Bước 1: Xóa các chi tiết đơn hàng liên quan
    connection.query(
        'DELETE FROM orderdetails WHERE orderId = ?',
        [id],
        (err) => {
            if (err) {
                console.error(err);
                return res.status(500).send({ error: 'Lỗi khi xóa chi tiết đơn hàng' });
            }

            // Bước 2: Sau khi xóa chi tiết đơn hàng, xóa đơn hàng
            connection.query(
                'DELETE FROM Orders WHERE orderId = ?',
                [id],
                (err, result) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).send({ error: 'Lỗi khi xóa đơn hàng' });
                    }
                    if (result.affectedRows === 0) {
                        return res.status(404).send({ error: 'Không tìm thấy đơn hàng' });
                    }
                    res.status(200).send({ message: 'Đơn hàng và chi tiết đã được xóa thành công' });
                }
            );
        }
    );
});

// Cập nhật đơn hàng
app.put('/api/orders/:orderId', (req, res) => {
    const { orderId } = req.params;
    const { totalAmount, shippingAddress, paymentMethod, orderStatus } = req.body;

    if (!totalAmount || !shippingAddress || !paymentMethod || !orderStatus) {
        return res.status(400).json({ error: 'Thông tin đơn hàng không đầy đủ' });
    }

    connection.query(
        'UPDATE Orders SET totalAmount = ?, shippingAddress = ?, paymentMethod = ?, orderStatus = ? WHERE orderId = ?',
        [totalAmount, shippingAddress, paymentMethod, orderStatus, orderId],
        (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Lỗi khi cập nhật đơn hàng' });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
            }
            res.json({ message: 'Đơn hàng đã được cập nhật' });
        }
    );
});

app.post('/api/orders', (req, res) => {
    connection.beginTransaction((err) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Lỗi khởi tạo giao dịch'
            });
        }

        const {
            ID_Users,
            items,
            shippingAddress,
            paymentMethod,
            totalAmount,
            couponApplied,
            subtotal,
            shippingFee,
            // couponDiscount,
            customerInfo
        } = req.body;

        // Validate dữ liệu
        if (!ID_Users || !items || !items.length || !shippingAddress || !paymentMethod || totalAmount === undefined || subtotal === undefined) {
            return connection.rollback(() => {
                res.status(400).json({
                    success: false,
                    message: 'Thiếu thông tin đơn hàng hoặc thông tin không hợp lệ'
                });
            });
        }

        const couponCode = couponApplied ? couponApplied.code : null;
        const couponDiscount = couponApplied ? couponApplied.discountAmount : 0;

        // Chèn đơn hàng với thông tin chi tiết về giá
        connection.query(
            'INSERT INTO Orders (ID_Users, totalAmount, subtotal, shippingFee, couponDiscount, couponCode, shippingAddress, paymentMethod, orderStatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                ID_Users,
                totalAmount,
                subtotal,
                shippingFee,
                couponDiscount || 0,
                couponCode,
                shippingAddress,
                paymentMethod,
                'pending'
            ],
            (error, orderResult) => {
                if (error) {
                    return connection.rollback(() => {
                        res.status(500).json({
                            success: false,
                            message: 'Lỗi tạo đơn hàng',
                            error: error
                        });
                    });
                }

                const orderId = orderResult.insertId;

                // Chèn chi tiết đơn hàng
                const orderDetails = items.map(item => [
                    orderId,
                    item.ID_SP,
                    item.quantity,
                    item.GiaSP
                ]);

                connection.query(
                    'INSERT INTO OrderDetails (orderId, ID_SP, quantity, price) VALUES ?',
                    [orderDetails],
                    (detailError) => {
                        if (detailError) {
                            return connection.rollback(() => {
                                res.status(500).json({
                                    success: false,
                                    message: 'Lỗi thêm chi tiết đơn hàng',
                                    error: detailError
                                });
                            });
                        }

                        // Commit giao dịch
                        connection.commit((commitError) => {
                            if (commitError) {
                                return connection.rollback(() => {
                                    res.status(500).json({
                                        success: false,
                                        message: 'Lỗi hoàn tất giao dịch',
                                        error: commitError
                                    });
                                });
                            }

                            res.status(201).json({
                                success: true,
                                message: 'Đặt hàng thành công',
                                orderId: orderId
                            });
                        });
                    }
                );
            }
        );
    });
});


app.post('/api/orders/send-confirmation', async (req, res) => {
    try {
        const { orderId, email, orderDetails } = req.body;

        // Tạo nội dung email
        const mailOptions = {
            from: 'your-email@gmail.com',
            to: email,
            subject: `Xác nhận đơn hàng #${orderId}`,
            html: `
          <h1>Cảm ơn bạn đã đặt hàng!</h1>
          <p>Xin chào ${orderDetails.customerName},</p>
          <p>Đơn hàng #${orderId} của bạn đã được xác nhận.</p>
          
          <h3>Chi tiết đơn hàng:</h3>
          <ul>
            ${orderDetails.orderItems.map(item => `
              <li>${item.productName} x ${item.quantity} = ${(item.price * item.quantity).toLocaleString()}đ</li>
            `).join('')}
          </ul>
          
          <p>Tổng tiền: ${orderDetails.totalAmount.toLocaleString()}đ</p>
          <p>Địa chỉ giao hàng: ${orderDetails.shippingAddress}</p>
          
          <p>Chúng tôi sẽ xử lý và giao hàng trong thời gian sớm nhất.</p>
          <p>Mọi thắc mắc xin vui lòng liên hệ hotline: 0123456789</p>
        `
        };

        // Gửi email
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Email error:', error);
                return res.status(500).json({
                    success: false,
                    message: 'Lỗi gửi email xác nhận'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Đã gửi email xác nhận'
            });
        });

    } catch (error) {
        console.error('Send email error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server'
        });
    }
});

// Thêm sản phẩm mới
app.post('/api/products', (req, res) => {
    const user = req.body.user; // Thay đổi đây để khớp với thông tin người dùng
    // if (!user || !user.isAdmin) {
    //     return res.status(403).json({ error: 'Bạn không có quyền truy cập.' }); // Trả về lỗi nếu không phải admin
    // }

    const { TenSP, LoaiSP, ThuongHieu, GiaSP, SLTonKho, MieuTaSP, HinhAnh } = req.body;

    // Kiểm tra xem các trường bắt buộc có được cung cấp không
    if (!TenSP || !LoaiSP || !ThuongHieu || GiaSP === undefined || SLTonKho === undefined || !MieuTaSP || !HinhAnh) {
        return res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ thông tin sản phẩm.' });
    }

    connection.query(
        'INSERT INTO products (TenSP, LoaiSP, ThuongHieu, GiaSP, SLTonKho, MieuTaSP, HinhAnh) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [TenSP, LoaiSP, ThuongHieu, GiaSP, SLTonKho, MieuTaSP, HinhAnh],
        (err) => {
            if (err) {
                console.error('Lỗi khi thêm sản phẩm:', err); // Log lỗi để dễ dàng khắc phục
                return res.status(500).json({ error: 'Đã xảy ra lỗi trong quá trình thêm sản phẩm. Vui lòng thử lại sau.' });
            }
            res.status(201).json({ message: 'Sản phẩm đã được thêm thành công.' });
        }
    );
});

// Cập nhật sản phẩm
app.put('/api/products/:id', (req, res) => {
    const user = req.body.user; // Tương tự như trên
    // if (!user || !user.isAdmin) {
    //     return res.status(403).json({ error: 'Bạn không có quyền truy cập.' });
    // }
    const { id } = req.params;
    const { TenSP, LoaiSP, ThuongHieu, GiaSP, SLTonKho, MieuTaSP, HinhAnh } = req.body; // Thêm HinhAnh vào đây
    connection.query('UPDATE products SET TenSP = ?, LoaiSP = ?, ThuongHieu = ?, GiaSP = ?, SLTonKho = ?, MieuTaSP = ?, HinhAnh = ? WHERE ID_SP = ?',
        [TenSP, LoaiSP, ThuongHieu, GiaSP, SLTonKho, MieuTaSP, HinhAnh, id],
        (err) => {
            if (err) return res.status(500).json({ error: 'Lỗi khi cập nhật sản phẩm' });
            res.json({ message: 'Sản phẩm đã được cập nhật' });
        }
    );
});

// Xóa sản phẩm
app.delete('/api/products/:id', (req, res) => {
    const user = req.body.user; // Lấy thông tin người dùng từ request
    // if (!user || !user.isAdmin) {
    //     return res.status(403).json({ error: 'Bạn không có quyền truy cập.' }); // Phân quyền
    // }

    const productId = req.params.id; // Lấy ID sản phẩm từ URL
    connection.query('DELETE FROM products WHERE ID_SP = ?', [productId], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Lỗi khi xóa sản phẩm' });
        }
        res.status(200).json({ message: 'Sản phẩm đã được xóa' });
    });
});

// Đăng ký người dùng
app.post('/api/register', (req, res) => {
    const { TenUser, Email, SDT, DiaChi, MatKhau, isAdmin } = req.body;
    const sql = 'INSERT INTO users (TenUser, Email, SDT, DiaChi, MatKhau, isAdmin) VALUES (?, ?, ?, ?, ?, ?)';

    connection.query(sql, [TenUser, Email, SDT, DiaChi, MatKhau, isAdmin], (err, result) => {
        if (err) {
            console.error('Lỗi khi đăng ký:', err);
            return res.status(500).json({ message: 'Đăng ký thất bại' });
        }
        return res.status(200).json({ message: 'Đăng ký thành công' });
    });
});

// Đăng nhập
app.post('/api/login', (req, res) => {
    const { Email, MatKhau } = req.body;
    const sql = 'SELECT * FROM users WHERE Email = ? AND MatKhau = ?';
    connection.query(sql, [Email, MatKhau], (err, result) => {
        if (err) return res.status(500).json({ message: 'Đăng nhập thất bại' });
        if (result.length > 0) {
            return res.status(200).json({
                message: 'Đăng nhập thành công', user: {
                    ID_Users: result[0].ID_Users,
                    TenUser: result[0].TenUser,
                    Email: result[0].Email,
                    SDT: result[0].SDT,
                    DiaChi: result[0].DiaChi,
                    isAdmin: result[0].isAdmin // Trả về quyền admin
                }
            });
        } else {
            return res.status(401).json({ message: 'Sai tài khoản hoặc mật khẩu' });
        }
    });
});
// API để kiểm tra mã giảm giá
app.post('/api/coupons/validate', async (req, res) => {
    const { code, total } = req.body;

    // Input validation
    if (!code) {
        return res.status(400).json({
            success: false,
            message: 'Mã giảm giá không được để trống'
        });
    }

    try {
        // Truy vấn kiểm tra mã giảm giá với các điều kiện chi tiết
        // Remove min_order_value condition since it's not in the current schema
        const [results] = await connection.promise().query(`
            SELECT 
                id, 
                code, 
                discount_amount, 
                discount_percent, 
                max_discount,
                expires_at,
                is_active
            FROM coupons 
            WHERE 
                code = ? 
                AND is_active = true 
                AND (expires_at IS NULL OR expires_at > NOW())
        `, [code]);

        // Kiểm tra nếu không tìm thấy mã giảm giá
        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Mã giảm giá không hợp lệ hoặc đã hết hạn'
            });
        }

        // Lấy thông tin mã giảm giá đầu tiên
        const coupon = results[0];

        // Tính toán giảm giá
        let discountAmount = 0;
        if (coupon.discount_percent > 0) {
            // Tính giảm giá theo phần trăm
            discountAmount = total * (coupon.discount_percent / 100);

            // Áp dụng giảm giá tối đa nếu có
            if (coupon.max_discount && discountAmount > coupon.max_discount) {
                discountAmount = coupon.max_discount;
            }
        } else if (coupon.discount_amount > 0) {
            // Tính giảm giá theo số tiền cố định
            discountAmount = coupon.discount_amount;
        }

        // Trả về thông tin mã giảm giá
        return res.json({
            success: true,
            coupon: {
                id: coupon.id,
                code: coupon.code,
                discount_amount: discountAmount,
                discount_percent: coupon.discount_percent || 0,
                max_discount: coupon.max_discount
            }
        });
    } catch (error) {
        // Ghi log lỗi chi tiết
        console.error('Lỗi xác thực mã giảm giá:', error);

        // Trả về thông báo lỗi
        return res.status(500).json({
            success: false,
            message: 'Lỗi hệ thống',
            error: error.message
        });
    }
});

app.get('/api/users', (req, res) => {
    connection.query('SELECT ID_Users, TenUser, Email, SDT, DiaChi, MatKhau, isAdmin FROM Users', (err, results) => {
        if (err) {
            res.status(500).send('Lỗi khi truy vấn dữ liệu');
        } else {
            res.json(results);
        }
    });
});

app.put('/api/users/:id', (req, res) => {
    const { id } = req.params;
    let { TenUser, Email, SDT, DiaChi, MatKhau, isAdmin } = req.body;

    // Kiểm tra và thay thế giá trị undefined nếu có
    if (TenUser === undefined) TenUser = null;
    if (Email === undefined) Email = null;
    if (SDT === undefined) SDT = null;
    if (DiaChi === undefined) DiaChi = null;
    if (MatKhau === undefined) MatKhau = null;
    if (isAdmin === undefined) isAdmin = 0; // Ví dụ, giá trị mặc định là 0 nếu không có

    // In log ra các giá trị nhận được từ body để debug
    console.log('Cập nhật thông tin người dùng với dữ liệu:', { TenUser, Email, SDT, DiaChi, MatKhau, isAdmin });

    connection.query(
        'UPDATE users SET TenUser = ?, Email = ?, SDT = ?, DiaChi = ?, MatKhau = ?, isAdmin = ? WHERE ID_Users = ?',
        [TenUser, Email, SDT, DiaChi, MatKhau, isAdmin, id],
        (err, result) => {
            if (err) {
                console.error('Error updating user:', err);
                return res.status(500).json({ error: 'Lỗi khi cập nhật người dùng' });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Người dùng không tồn tại' });
            }
            res.json({ message: 'Người dùng đã được cập nhật' });
        }
    );
});


app.delete('/api/users/:id', (req, res) => {
    const userId = req.params.id; // Lấy ID người dùng từ URL

    // Câu truy vấn SQL để xóa người dùng
    connection.query('DELETE FROM users WHERE ID_Users = ?', [userId], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Lỗi khi xóa người dùng' });
        }
        res.status(200).json({ message: 'Người dùng đã được xóa' });
    });
});


app.listen(process.env.PORT || 8080, () => {
    console.log(`Backend app listening on port ${process.env.PORT}`)
})


